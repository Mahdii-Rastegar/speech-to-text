بسته‌ی GPU آوانویس (فقط برای کارت گرافیک NVIDIA)

نصب
----
۱. برنامه را ببندید.
۲. همه‌ی فایل‌های پوشه‌ی engine این بسته را داخل پوشه‌ی engine برنامه
   (کنار whisper-server.exe) کپی کنید.
۳. برنامه را باز کنید. در «تنظیمات» ← «مدل‌های موتور محلی» باید نوشته باشد که
   موتور محلی روی کارت گرافیک اجرا می‌شود.

لازم است درایور NVIDIA روی کامپیوتر نصب و به‌روز باشد. مدل پیشنهادی حدود
۱ گیگابایت از حافظه‌ی کارت گرافیک را می‌گیرد.

بدون کارت NVIDIA این بسته هیچ فایده‌ای ندارد؛ برنامه بدون آن هم کار می‌کند.


Avanevis GPU pack (NVIDIA graphics cards only). Close the app, copy the files
in this pack's engine folder into the app's engine folder, start the app again.

The CUDA runtime libraries in this pack (cublas64_11.dll, cublasLt64_11.dll,
cudart64_110.dll) are NVIDIA's, redistributed with this application under the
NVIDIA CUDA Toolkit End User License Agreement:
https://docs.nvidia.com/cuda/eula/
ggml-cuda.dll is part of whisper.cpp (MIT licence, see the app's licenses folder).
