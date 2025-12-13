# Zipformer (Streaming ASR)

## Tổng quan

**Zipformer** là model chủ lực của dự án, được thiết kế cho mục đích **True Real-time Speech-to-Text**. Model này sử dụng kiến trúc **Transducer (RNN-T)**, cho phép nhận diện giọng nói ngay khi dữ liệu audio được stream tới mà không cần chờ hết câu.

- **Source:** `hynt/Zipformer-30M-RNNT-6000h`
- **Engine:** `sherpa-onnx`
- **Độ trễ mục tiêu:** < 300ms

---

## Kiến trúc Kỹ thuật

### 1. OfflineRecognizer với Streaming Logic

Mặc dù chúng ta sử dụng class `OfflineRecognizer` của `sherpa-onnx`, nhưng chúng ta implement theo cơ chế **Streaming** thủ công:

1.  **Khởi tạo:** Load model ONNX (Encoder, Decoder, Joiner) vào RAM.
2.  **Tạo Stream:** Mỗi phiên WebSocket tạo một `stream` riêng biệt (`recognizer.create_stream()`).
3.  **Xử lý Chunk:**
    - Audio từ Client được gửi liên tục (chunk nhỏ ~100ms - 500ms).
    - Backend nhận chunk -> Decode ngay lập tức -> Trả về text.
    - Context của câu được giữ trong `stream` object.

### 2. File Assets

Model bao gồm các file sau (được tải tự động vào `backend/models_storage/zipformer`):

- `encoder-epoch-20-avg-10.int8.onnx`: Bộ mã hóa âm thanh (Quantized int8).
- `decoder-epoch-20-avg-10.int8.onnx`: Bộ giải mã văn bản.
- `joiner-epoch-20-avg-10.int8.onnx`: Bộ kết hợp kết quả.
- `tokens.txt`: File ánh xạ token ID sang ký tự (Được generate từ `bpe.model`).

---

## Cấu hình & Sử dụng

### Load Model (Worker)

```python
import sherpa_onnx

recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
    tokens="path/to/tokens.txt",
    encoder="path/to/encoder.onnx",
    decoder="path/to/decoder.onnx",
    joiner="path/to/joiner.onnx",
    num_threads=1,
    sample_rate=16000,
    feature_dim=80,
    decoding_method="greedy_search", # Nhanh nhất
    provider="cpu"
)
```

### Xử lý Stream

```python
stream = recognizer.create_stream()

# Nhận audio chunk (float32, normalized)
stream.accept_waveform(16000, samples)

# Decode
recognizer.decode_stream(stream)

# Lấy kết quả
text = stream.result.text
```

---

## Ưu điểm & Nhược điểm

| Ưu điểm                                         | Nhược điểm                                                   |
| :---------------------------------------------- | :----------------------------------------------------------- |
| **Tốc độ cực nhanh:** Phản hồi gần như tức thì. | **Độ chính xác:** Thấp hơn Whisper một chút ở các từ hiếm.   |
| **Nhẹ:** Chỉ tốn ~200MB RAM.                    | **Ngữ cảnh:** Khả năng sửa lỗi ngữ pháp kém hơn Transformer. |
| **CPU Friendly:** Chạy tốt trên CPU thường.     |                                                              |
