# Security

Avanevis turns speech into text. It handles three things worth protecting: what you say (audio), what was written down (transcripts), and the API keys of the cloud services you choose to use. This page says where each of them goes, what the app does to keep them there, and what it cannot protect against.

## Where your data goes

|                     | Desktop app (Windows)                                                                                                                     | Web app (iPhone PWA)                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Audio, local engine | Stays on the computer. It goes from the app to the engine over the loopback interface (`127.0.0.1`).                                      | No local engine.                                                      |
| Audio, cloud engine | Sent to the service you chose (OpenRouter or Google Gemini), over HTTPS.                                                                  | The same.                                                             |
| Transcript          | Stored in `data/history.sqlite3` beside the app. Sent to a cloud service only when the AI step (clean-up, summary, title) is switched on. | Stored in the browser's IndexedDB. Sent out under the same condition. |
| API keys            | Windows Credential Manager, entries named `Avanevis/<service>`.                                                                           | IndexedDB, encrypted with a WebCrypto key that cannot be exported.    |
| Settings            | `data/webview` beside the app. No keys.                                                                                                   | localStorage. No keys.                                                |

Audio is never written to disk. There is no account, no analytics and no telemetry: the app makes no request you did not ask for. The only addresses it talks to are

- `openrouter.ai` and `generativelanguage.googleapis.com`, with your key, when a cloud engine or the AI step is in use;
- `huggingface.co`, without any key, when you download a model for the local engine.

## How the keys are handled

**Desktop.** The interface runs in a web view and never holds a stored key. It can save, replace, test and delete one, but there is no command that reads one back. Requests to the cloud services are sent by the native side (`src-tauri/src/cloud.rs`), which reads the key from the Credential Manager and attaches it there. Each service has one fixed base address, the path below it is validated on both sides, and redirects are not followed, so a key can only reach the service it belongs to. The web view's Content-Security-Policy allows connections to the app itself and nothing else.

Keys are tied to the Windows user account, not to the app folder: copying the portable folder does not copy them.

**Web app.** A browser has no place that is out of the page's own reach, so the protection is weaker by nature. The key is encrypted with AES-GCM under a non-extractable key before it is stored, which keeps a usable key out of the storage files and out of backups. Code running in the page could still use it, which is why the page is served with a strict Content-Security-Policy (`public/_headers`): scripts only from the site itself, connections only to the two cloud services. For the phone, use a separate key with a low spending limit.

## Other measures

- The local engine (whisper.cpp's server) is a child process listening on `127.0.0.1` only, on a port picked at start. A Windows job object ends it when the app ends for any reason.
- A downloaded model is accepted only if its length and SHA-256 match the values compiled into the app.
- What the interface sends to the native side is validated there: provider names, request paths, model ids, the language code, the shape of a key.
- Deleted History entries are overwritten in the database file (`secure_delete`).
- The app requests no Tauri capability beyond the core defaults: no file system, shell or HTTP access from the web view.

## What is not protected

- **Other software running as you.** A program running under your Windows account can read the History database, can ask the Credential Manager for the keys, and can talk to the engine's loopback port while it runs. The app does not defend against malware on the same account.
- **The History file is not encrypted.** Anyone who gets the `data` folder can read your transcripts. Leave it out when you pass the portable folder on.
- **The cloud services see what you send them.** With a cloud engine that is your audio; with the AI step, your transcript. Their own terms decide what happens to it. Use the local engine for anything that must not leave the computer.
- **The executable is not code-signed.** Windows may warn before running it, and nothing but the source you got it from vouches for a copy.
- **A compromised browser or extension** can reach whatever the web app can.

## Review before publication (2026-10-05)

- The whole git history was searched for key patterns, private keys, personal e-mail addresses, machine paths and forbidden file types (audio, models, databases, `.env`, `*.local`): nothing found. All commits carry a GitHub `noreply` address.
- `pnpm audit`: no known vulnerabilities.
- The 470 crates in `Cargo.lock` were checked against the OSV database: three advisories, none in code that ships. Two are for `glib` 0.18, which is only compiled for Linux; one marks `proc-macro-error` as unmaintained, a build-time dependency.
- Unit tests cover path validation, key shape, payload parsing and checksum refusal; an end-to-end test checks that the web app stores no readable key and sends it to its own service only.

## Reporting a problem

Please report a vulnerability privately through the repository's "Report a vulnerability" button (Security tab) rather than in a public issue.
