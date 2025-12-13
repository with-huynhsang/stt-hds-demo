# DOCS-MODELS: Technical Specifications & Configuration

### 1. Model Overview

| Model              | Architecture          | Engine (Runner)    | Size (Params) | Quantization | RAM Est. | Latency Target |
| :----------------- | :-------------------- | :----------------- | :------------ | :----------- | :------- | :------------- |
| **Zipformer**      | Transducer (RNN-T)    | `sherpa-onnx`      | 30M           | int8         | ~200 MB  | < 500ms        |

---

### 2. Detailed Configuration

#### Zipformer (The Vietnamese Specialist)

Đây là model chính được tối ưu cho tiếng Việt với real-time streaming capabilities.

- **Source:** `hynt/Zipformer-30M-RNNT-6000h` (Trained on 6000h Vietnamese)
- **Format:** ONNX (Open Neural Network Exchange).
- **Execution Engine:** `sherpa-onnx` (Python wrapper).
- **Implementation:** Sử dụng `OfflineRecognizer.from_transducer()` với buffered audio chunks.
- **Input Requirement:**
  - Audio chunks buffered (16000Hz, float32).
  - Feature extraction: Fbank (được xử lý nội bộ bởi sherpa).
- **Decoding Method:** Greedy Search (nhanh nhất).
- **File Assets cần thiết:**
  - `encoder-epoch-20-avg-10.int8.onnx`
  - `decoder-epoch-20-avg-10.int8.onnx`
  - `joiner-epoch-20-avg-10.int8.onnx`
  - `tokens.txt`, `bpe.model`

**Key Features:**
- Real-time streaming transcription
- Low latency (< 500ms)
- Optimized for Vietnamese language
- Lightweight model suitable for CPU inference

---

### 3. Directory Structure (Cấu trúc thư mục Model)

Hệ thống sử dụng thư mục `backend/models_storage` để lưu trữ model. Script `scripts/setup_models.py` sẽ tự động tạo và tải file vào đây.

```text
backend/
  models_storage/
    zipformer/
      hynt-zipformer-30M-6000h/
        encoder-epoch-20-avg-10.int8.onnx
        decoder-epoch-20-avg-10.int8.onnx
        joiner-epoch-20-avg-10.int8.onnx
        tokens.txt
        bpe.model
```

### 4. Hardware Requirements (Yêu cầu phần cứng)

- **CPU:** Tối thiểu 2 Cores. AVX2 support là bắt buộc cho quantization int8.
- **RAM:** Tối thiểu 2GB (cho OS + Docker + Model).
- **GPU:** Không cần thiết. Zipformer chạy tốt trên CPU.

### 5. Setup Instructions

```bash
# 1. Run setup script
python scripts/setup_models.py

# 2. Start backend
cd backend
pip install -r requirements.txt
python main.py
```

The setup script will automatically download the Zipformer model files from HuggingFace and generate the required `tokens.txt` file from `bpe.model`.
