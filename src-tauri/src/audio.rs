//! Decoding audio files the web view cannot read.
//!
//! The interface decodes uploaded files itself and comes here only when that
//! fails, which is what happens with Apple Lossless: the format iPhone voice
//! memos are saved in when recorded as "lossless". The result is what every
//! engine is fed: 16 kHz, mono.

use std::io::{Cursor, ErrorKind};

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

pub const TARGET_RATE: u32 = 16_000;

/// Lobes of the sinc kernel on each side. More is sharper and slower.
const ZERO_CROSSINGS: f64 = 8.0;
/// Keeps the cutoff a little under the new Nyquist limit, where the filter is still rolling off.
const CUTOFF_MARGIN: f64 = 0.92;

/// The first sound track of the file, mixed down to mono, at `TARGET_RATE`.
pub fn decode(bytes: Vec<u8>) -> Result<Vec<f32>, String> {
    let stream = MediaSourceStream::new(Box::new(Cursor::new(bytes)), Default::default());
    let mut format = symphonia::default::get_probe()
        .format(&Hint::new(), stream, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|error| format!("unrecognized file: {error}"))?
        .format;
    let track = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or("the file has no sound track")?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|error| format!("unsupported audio format: {error}"))?;

    let mut mono = Vec::new();
    let mut rate = 0;
    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            // This is how the end of the file is reported.
            Err(Error::IoError(error)) if error.kind() == ErrorKind::UnexpectedEof => break,
            Err(Error::ResetRequired) => break,
            Err(error) => return Err(format!("unreadable file: {error}")),
        };
        if packet.track_id() != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            // One damaged packet is a click, not a reason to give up on the file.
            Err(Error::DecodeError(_)) => continue,
            Err(error) => return Err(format!("unreadable audio: {error}")),
        };
        let spec = *decoded.spec();
        let channels = spec.channels.count().max(1);
        rate = spec.rate;
        let mut samples = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
        samples.copy_interleaved_ref(decoded);
        mono.extend(samples.samples().chunks_exact(channels).map(|frame| frame.iter().sum::<f32>() / channels as f32));
    }
    if mono.is_empty() || rate == 0 {
        return Err("the file holds no audio".into());
    }
    Ok(resample(&mono, rate, TARGET_RATE))
}

fn gcd(a: u32, b: u32) -> u32 {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

/// Sample-rate conversion with a windowed sinc filter, the same one the
/// interface uses for the microphone: frequencies the new rate cannot hold are
/// filtered out first, so they do not fold back into the speech band.
fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to {
        return input.to_vec();
    }
    // Output sample n sits at input position n * down / up, so only `up`
    // different offsets between two input samples ever occur: one filter each.
    let divisor = gcd(from, to);
    let (up, down) = ((to / divisor) as usize, (from / divisor) as usize);
    let cutoff = (f64::from(to) / f64::from(from)).min(1.0) * CUTOFF_MARGIN;
    let half = (ZERO_CROSSINGS / cutoff).ceil() as isize;
    let taps = (2 * half) as usize;

    let kernel = |distance: f64| {
        if distance.abs() >= half as f64 {
            return 0.0;
        }
        let window = 0.5 * (1.0 + (std::f64::consts::PI * distance / half as f64).cos());
        let x = std::f64::consts::PI * cutoff * distance;
        let sinc = if x == 0.0 { 1.0 } else { x.sin() / x };
        (cutoff * sinc * window) as f32
    };
    // filters[phase][tap] weighs the input sample at `base - half + 1 + tap`.
    let filters: Vec<f32> = (0..up)
        .flat_map(|phase| {
            let offset = phase as f64 / up as f64;
            (0..taps).map(move |tap| (tap as isize - half + 1) as f64 - offset)
        })
        .map(kernel)
        .collect();

    let length = (input.len() * up).div_ceil(down);
    let mut output = Vec::with_capacity(length);
    for n in 0..length {
        let position = n * down;
        let (base, phase) = ((position / up) as isize, position % up);
        let filter = &filters[phase * taps..(phase + 1) * taps];
        let first = base - half + 1;
        let mut sum = 0.0f32;
        for (tap, weight) in filter.iter().enumerate() {
            let index = first + tap as isize;
            if index >= 0 && (index as usize) < input.len() {
                sum += input[index as usize] * weight;
            }
        }
        output.push(sum);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(frequency: f64, rate: u32, seconds: f64) -> Vec<f32> {
        (0..(f64::from(rate) * seconds) as usize)
            .map(|n| (2.0 * std::f64::consts::PI * frequency * n as f64 / f64::from(rate)).sin() as f32)
            .collect()
    }

    /// Loudness of the middle of the signal, away from the filter's run-in and run-out.
    fn rms(signal: &[f32]) -> f32 {
        let middle = &signal[signal.len() / 4..signal.len() * 3 / 4];
        (middle.iter().map(|sample| sample * sample).sum::<f32>() / middle.len() as f32).sqrt()
    }

    fn wav(rate: u32, channels: u16, frames: &[i16]) -> Vec<u8> {
        let data_len = (frames.len() * 2) as u32;
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36 + data_len).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes());
        wav.extend_from_slice(&channels.to_le_bytes());
        wav.extend_from_slice(&rate.to_le_bytes());
        wav.extend_from_slice(&(rate * u32::from(channels) * 2).to_le_bytes());
        wav.extend_from_slice(&(channels * 2).to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&data_len.to_le_bytes());
        frames.iter().for_each(|sample| wav.extend_from_slice(&sample.to_le_bytes()));
        wav
    }

    #[test]
    fn keeps_speech_frequencies_at_their_level() {
        for rate in [48_000, 44_100, 8_000] {
            let output = resample(&sine(1000.0, rate, 1.0), rate, TARGET_RATE);
            assert!((output.len() as i64 - 16_000).abs() <= 1, "one second stays one second at {rate}");
            assert!((rms(&output) - 0.7071).abs() < 0.01, "level kept at {rate}: {}", rms(&output));
        }
    }

    #[test]
    fn removes_what_the_lower_rate_cannot_hold() {
        // 10 kHz would come out as a false 6 kHz tone if it were let through.
        let output = resample(&sine(10_000.0, 48_000, 1.0), 48_000, TARGET_RATE);
        assert!(rms(&output) < 0.01, "left over: {}", rms(&output));
    }

    #[test]
    fn decodes_a_file_to_mono_at_the_engine_rate() {
        // Two seconds of stereo at 44.1 kHz, the tone on one side only.
        let frames: Vec<i16> = sine(440.0, 44_100, 2.0)
            .iter()
            .flat_map(|sample| [(sample * 20_000.0) as i16, 0])
            .collect();
        let samples = decode(wav(44_100, 2, &frames)).expect("a valid file");

        assert!((samples.len() as i64 - 32_000).abs() <= 1);
        // Half of 20000/32768, as a sine's RMS.
        assert!((rms(&samples) - 0.2158).abs() < 0.01, "level: {}", rms(&samples));
    }

    #[test]
    fn refuses_what_is_not_audio() {
        assert!(decode(b"this is not sound".to_vec()).is_err());
        assert!(decode(Vec::new()).is_err());
    }
}
