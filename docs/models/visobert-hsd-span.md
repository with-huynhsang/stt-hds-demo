# ViSoBERT-HSD-Span (Hate Speech Span Detection)

## Tổng quan

**ViSoBERT-HSD-Span** là model được fine-tune từ [uitnlp/visobert](https://huggingface.co/uitnlp/visobert) cho bài toán **Hate Speech Span Detection** tiếng Việt. Model này sử dụng **Token Classification với BIO tagging** để phát hiện và định vị chính xác các đoạn văn bản độc hại (toxic spans) trong kết quả transcription.

- **Source:** `visolex/visobert-hsd-span`
- **Base Model:** `uitnlp/visobert` (XLM-RoBERTa architecture)
- **Task:** Token Classification (BIO Tagging)
- **License:** Apache-2.0

---

## Thông số Model

### Kích thước & Tài nguyên

| Thuộc tính | Giá trị |
|------------|---------|
| **Parameters** | ~97M |
| **Architecture** | XLM-RoBERTa (Encoder-only) |
| **Tensor Type** | FP32 (ONNX INT8 sau quantization) |
| **Model Size (disk)** | ~400MB (FP32) / ~100MB (INT8) |
| **Memory (inference)** | ~200MB RAM (INT8 quantized) |
| **Max Sequence Length** | **64 tokens** |

### Labels (BIO Tagging Scheme)

Model sử dụng BIO (Beginning, Inside, Outside) tagging để đánh dấu toxic spans:

| Label ID | Label Name | Mô tả |
|----------|------------|-------|
| 0 | **O** | Outside - Không thuộc toxic span |
| 1 | **B-T** | Beginning - Bắt đầu toxic span |
| 2 | **I-T** | Inside - Tiếp tục toxic span |

**Ví dụ:**
```
Text:     thằng ngu này   sao mà chậm quá
Labels:   B-T   I-T O       O   O  O    O
Spans:    [{"text": "thằng ngu", "start": 0, "end": 9}]
```

---

## Dataset & Training

### ViHOS Dataset

Model được train trên **ViHOS** (Vietnamese Hate and Offensive Spans), là bộ dataset chuyên cho span detection:

- **Task:** Token-level span detection (BIO tagging)
- **Domain:** Social media text (Facebook, Twitter)
- **Size:** 11,100+ annotated samples
- **Annotation:** Character-level và token-level toxic spans

### Hyperparameters

```yaml
batch_size: 32
learning_rate: 5e-6
epochs: 100
early_stopping_patience: 5
max_sequence_length: 64
optimizer: AdamW
framework: HuggingFace Transformers
```

### Performance Metrics

| Metric | Score |
|--------|-------|
| **F1** | 0.6364 |
| **Precision** | 0.6358 |
| **Recall** | 0.6373 |
| **Exact Match** | 0.1230 |

---

## Cách sử dụng

### Basic Usage (PyTorch with Token Classification)

```python
from transformers import AutoTokenizer, AutoModelForTokenClassification
import torch

# Load model
tokenizer = AutoTokenizer.from_pretrained("visolex/visobert-hsd-span")
model = AutoModelForTokenClassification.from_pretrained("visolex/visobert-hsd-span")

# Detect toxic spans
text = "thằng ngu này sao mà chậm quá"
inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=64)

with torch.no_grad():
    logits = model(**inputs).logits
    pred_ids = logits.argmax(-1)[0].tolist()

# Decode BIO tags to spans
label_map = {0: "O", 1: "B-T", 2: "I-T"}
tokens = tokenizer.convert_ids_to_tokens(inputs["input_ids"][0])

print("Token predictions:")
for token, pred_id in zip(tokens, pred_ids):
    if token not in ["<s>", "</s>", "<pad>"]:
        print(f"{token}: {label_map[pred_id]}")
```

### Extract Spans from BIO Tags

```python
def extract_spans(text: str, bio_tags: list) -> list:
    """Extract toxic spans from BIO tags."""
    spans = []
    current_span = None
    
    for i, tag in enumerate(bio_tags):
        if tag == 1:  # B-T: Start new span
            if current_span:
                spans.append(current_span)
            current_span = {"start": i, "end": i}
        elif tag == 2 and current_span:  # I-T: Continue span
            current_span["end"] = i
        elif tag == 0 and current_span:  # O: End span
            spans.append(current_span)
            current_span = None
    
    if current_span:
        spans.append(current_span)
    
    return spans
```

### ONNX Inference (Production)

```python
from optimum.onnxruntime import ORTModelForTokenClassification
from transformers import AutoTokenizer

# Load quantized INT8 model
tokenizer = AutoTokenizer.from_pretrained("path/to/visobert-hsd-span/onnx-int8")
model = ORTModelForTokenClassification.from_pretrained(
    "path/to/visobert-hsd-span/onnx-int8",
    file_name="model_quantized.onnx",
    provider="CPUExecutionProvider"
)

# Run inference
text = "đồ chó này làm ăn thế à"
inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=64)
outputs = model(**inputs)
predictions = outputs.logits.argmax(-1)[0].tolist()
```

---

## So sánh với các Model khác

| Model | Task | Max Length | Output | Use Case |
|-------|------|------------|--------|----------|
| **visobert-hsd-span** ✅ | Token Classification | 64 | BIO tags + spans | Span extraction |
| visobert-hsd | Text Classification | 256 | CLEAN/OFFENSIVE/HATE | Overall classification |
| phobert-hsd | Text Classification | 256 | Binary (toxic/clean) | Simple filtering |

### Tại sao chọn ViSoBERT-HSD-Span?

1. **Span Detection**: Không chỉ phát hiện có toxic hay không, mà còn **định vị chính xác** đoạn toxic
2. **Hybrid Approach**: Backend kết hợp model predictions với rule-based fallback
3. **Unified Moderation**: Từ detected spans, có thể infer moderation label (CLEAN/OFFENSIVE/HATE)
4. **Lightweight**: Max length 64 tokens → faster inference
5. **Dataset chuyên biệt**: ViHOS dataset với character-level annotations

---

## Ưu điểm & Nhược điểm

| Ưu điểm | Nhược điểm |
|---------|------------|
| **Span Localization:** Định vị chính xác toxic spans | **F1 Score:** 0.636 (moderate, có thể miss một số spans) |
| **Nhẹ:** ~100MB INT8 / ~200MB RAM | **Short Context:** Max 64 tokens only |
| **Nhanh:** Latency ~10-30ms/request (INT8) | **False positives:** Có thể flag nhầm trong ngữ cảnh đặc biệt |
| **Hybrid Detection:** Model + rule-based fallback | **Domain specific:** Train chủ yếu từ social media |
| **ONNX INT8:** Production-ready với quantization | **BIO tagging:** Cần post-processing để extract spans |
| **Unified Moderation:** Có thể infer label từ spans | |

---

## Tích hợp với Hệ thống

### Vị trí trong Pipeline

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────────┐     ┌──────────┐
│   Audio     │────▶│  Zipformer   │────▶│  ViSoBERT-HSD-Span   │────▶│  Client  │
│   Stream    │     │  (STT)       │     │  (Span Detection)    │     │  Result  │
└─────────────┘     └──────────────┘     └──────────────────────┘     └──────────┘
     16kHz           Transcription         BIO tags → Spans +           JSON
                                           Inferred Label
```

### Hybrid Detection Strategy

Backend sử dụng **2-tier detection**:

1. **Model-based**: ViSoBERT-HSD-Span với BIO tagging
2. **Rule-based fallback**: Common offensive phrases (ASR-specific, no diacritics)

### Label Inference Logic

Từ detected spans, hệ thống infer moderation label:

- **CLEAN**: Không có span nào detected
- **OFFENSIVE**: Có spans với mild offensive indicators (ngu, điên, khùng, vl, etc.)
- **HATE**: Có spans với severe hate indicators (giết, chết, hiếp, súc sinh, etc.)

### Output Format

```json
{
  "text": "thằng ngu này sao mà chậm quá",
  "is_final": true,
  "model": "zipformer",
  "content_moderation": {
    "spans": [
      {
        "text": "thằng ngu",
        "start": 0,
        "end": 9,
        "method": "model"
      }
    ],
    "label": "OFFENSIVE",
    "confidence": 0.82,
    "is_flagged": true
  }
}
```

---

## Files & Storage

### Cấu trúc thư mục

```
backend/models_storage/
├── zipformer/
│   └── hynt-zipformer-30M-6000h/
│       ├── encoder-epoch-20-avg-10.int8.onnx
│       ├── decoder-epoch-20-avg-10.int8.onnx
│       ├── joiner-epoch-20-avg-10.int8.onnx
│       └── tokens.txt
│
└── visobert-hsd-span/                    # Token Classification Model
    ├── onnx/                             # FP32 ONNX (intermediate)
    │   ├── model.onnx                    # ~400MB
    │   ├── config.json
    │   ├── tokenizer.json
    │   └── special_tokens_map.json
    │
    └── onnx-int8/                        # INT8 Quantized (production)
        ├── model_quantized.onnx          # ~100MB
        ├── config.json
        ├── tokenizer.json
        └── special_tokens_map.json
```

### Setup Script

Sử dụng script để tự động download và convert:

```bash
python scripts/setup_models.py --visobert
```

Script sẽ:
1. Download model từ HuggingFace (`visolex/visobert-hsd-span`)
2. Convert to ONNX format
3. Quantize to INT8 (giảm ~75% size, tăng tốc inference)
4. Verify model functionality

---

## References

- **HuggingFace:** https://huggingface.co/visolex/visobert-hsd-span
- **Base Model:** https://huggingface.co/uitnlp/visobert
- **Dataset:** https://huggingface.co/datasets/visolex/ViHOS
- **Collection:** https://huggingface.co/collections/visolex/hate-speech-span-detection
- **Paper (ViSoBERT):** Vietnamese Social Media Text Processing

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-12-13 | Updated to visobert-hsd-span (Token Classification) |
| 1.0.0 | 2025-12-02 | Initial documentation (visobert-hsd) |
