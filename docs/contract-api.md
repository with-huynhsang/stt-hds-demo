# Hợp đồng API & Quy trình Tích hợp

Tài liệu này định nghĩa quy trình chuẩn để đảm bảo an toàn kiểu dữ liệu (type safety) 100% và sự đồng bộ giữa Backend (FastAPI) và Frontend (React) sử dụng **Hey-API**.

## 1. "Hợp đồng" (The Contract - OpenAPI)

**Nguồn sự thật duy nhất (Single Source of Truth)** cho API của chúng ta là OpenAPI Specification (Swagger) được tạo bởi FastAPI.

- **Vị trí:** `http://localhost:8000/openapi.json`
- **Tạo tự động:** Thông qua FastAPI dựa trên Pydantic models và path operations.
- **Tùy chỉnh:** Chúng ta thiết lập `servers` URL trong `backend/main.py` để đảm bảo client được tạo ra trỏ đúng về server development local.

## 2. Công cụ: Hey-API (`@hey-api/openapi-ts`)

Chúng ta sử dụng `hey-api` để tạo TypeScript client khớp chính xác với định nghĩa của Backend.

### Tại sao dùng Hey-API?

- **An toàn kiểu (Type Safety):** TypeScript interfaces được tạo trực tiếp từ Python Pydantic models.
- **Đồng bộ:** Bất kỳ thay đổi nào ở Backend (ví dụ: đổi tên trường) sẽ gây lỗi build ở Frontend, ngăn chặn crash khi chạy (runtime).
- **Plugins:** Hỗ trợ tích hợp TanStack Query và Zod.

### Cấu hình (`frontend/openapi-ts.config.ts`)

```typescript
import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  client: "@hey-api/client-fetch", // Dùng Fetch wrapper nhẹ (Không cần Axios)
  input: "http://localhost:8000/openapi.json",
  output: "src/client",
  plugins: [
    "@tanstack/react-query", // Tạo Query Options cho useQuery
    "zod", // Tạo Zod schemas để validate
  ],
});
```

### Axios vs. Client-Fetch

Chúng ta dùng **`@hey-api/client-fetch`** thay vì Axios.

- **Tại sao?** Nó nhẹ, native với trình duyệt, và tích hợp hoàn toàn với code được sinh ra.
- **Interceptors:** `client-fetch` hỗ trợ middleware cho các tác vụ như thêm Auth headers hoặc logging, tương tự Axios interceptors.

## 3. Quy trình: Backend đến Frontend

### Bước 1: Thay đổi ở Backend

1.  Sửa Pydantic Model hoặc Endpoint trong FastAPI.
2.  Đảm bảo Backend đang chạy (`python main.py`).
3.  Kiểm tra `http://localhost:8000/docs` để thấy sự thay đổi.

### Bước 2: Generate Client

Chạy lệnh generate trong thư mục Frontend:

```bash
cd frontend
bun run gen:api
# Hoặc: npm run gen:api / pnpm run gen:api
```

Lệnh này sẽ:

1.  Lấy `openapi.json` từ Backend đang chạy.
2.  Cập nhật `src/client/types.gen.ts` (Interfaces).
3.  Cập nhật `src/client/sdk.gen.ts` (Functions).
4.  Cập nhật `src/client/zod.gen.ts` (Validation Schemas).

### Bước 3: Sử dụng ở Frontend

**A. Sử dụng TanStack Query (Khuyên dùng cho REST)**

```tsx
import { useQuery } from "@tanstack/react-query";
import { getHistoryOptions } from "@/client/@tanstack/react-query.gen";

function HistoryList() {
  // Type-safe data fetching
  const { data } = useQuery({
    ...getHistoryOptions(),
  });

  return (
    <div>
      {data?.map((item) => (
        <p>{item.content}</p>
      ))}
    </div>
  );
}
```

**B. Sử dụng Zod để Validate (Zod v4)**

```tsx
import { z } from 'zod';
import { TranscriptionLogSchema } from '@/client/zod.gen';

// Dùng schema được tạo ra để validate form hoặc dữ liệu
const myData = { ... };
const result = TranscriptionLogSchema.safeParse(myData);

// Zod v4 cũng hỗ trợ type inference
type TranscriptionLog = z.infer<typeof TranscriptionLogSchema>;
```

## 4. Quy tắc & Best Practices

1.  **KHÔNG BAO GIỜ** sửa thủ công các file trong `src/client`. Chúng được tạo tự động.
2.  **LUÔN LUÔN** chạy `bun run gen:api` sau khi pull code Backend mới.
3.  **LUÔN LUÔN** định nghĩa return types trong FastAPI endpoints (`response_model=...`) để đảm bảo TypeScript types được tạo ra.
4.  **Tích hợp Zustand:** Với global state (như trạng thái WebSocket), dùng Zustand. Với server state (dữ liệu REST API), dùng TanStack Query thông qua options được tạo ra.

---

**Xem thêm:** [Tài liệu Frontend](docs-fe.md)
