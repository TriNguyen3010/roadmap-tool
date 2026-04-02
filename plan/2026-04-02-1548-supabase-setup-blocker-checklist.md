# Supabase Setup Blocker Checklist

## Mục tiêu

Khôi phục khả năng mở app sau khi roadmap chuyển sang flow auth mới dùng `Supabase + Google OAuth + team_members`.

## Chẩn đoán nhanh

### Lỗi hiện tại

App đang crash ngay khi render client với lỗi:

`Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Nguyên nhân gốc

- `src/hooks/useGoogleAuth.ts` luôn khởi tạo Supabase browser client khi app load.
- `src/lib/supabaseBrowser.ts` sẽ `throw` ngay nếu thiếu:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Vì vậy, hiện tại website chưa vào được không phải do bảng `team_members` hay Google Provider trước tiên, mà do thiếu 2 env public bắt buộc.

## Kết quả check local hiện tại

### `.env.local`

Đang có:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUDINARY_URL`
- `UPLOAD_MAX_MB`
- `EDITOR_PASSWORD`

Đang thiếu:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### `.env.example`

Hiện vẫn chưa phản ánh flow auth mới, vì mới chỉ có:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Chưa có 2 biến `NEXT_PUBLIC_*` nên rất dễ gây thiếu config khi setup máy mới.

## Thứ tự setup nên làm

### Phase 1 - Gỡ lỗi crash để app mở được

Thêm vào `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

Nguồn lấy:

- Supabase Dashboard -> `Settings` -> `API`
- lấy:
  - `Project URL`
  - `anon public key`
  - `service_role key`

Sau đó:

1. restart `npm run dev`
2. mở lại app

Kỳ vọng sau Phase 1:

- app không còn crash ở màn hình đầu
- nếu các bước Supabase khác chưa xong, app sẽ sang lỗi mức kế tiếp như login/provider/team permission, chứ không còn runtime error vì thiếu env

## Phase 2 - Bật Google Auth trên Supabase

Trong Supabase:

1. vào `Authentication` -> `Providers`
2. bật `Google`
3. điền `Client ID` và `Client Secret` từ Google Cloud OAuth app

Trong Supabase Auth URL config:

1. set `Site URL`
   - local: `http://localhost:3000`
   - production: domain thật của app
2. thêm `Redirect URLs`
   - `http://localhost:3000/auth/callback`
   - `https://your-domain/auth/callback`

Trong Google Cloud Console:

1. mở OAuth Client đang dùng cho Supabase
2. thêm đúng callback URI mà Supabase yêu cầu
3. callback này thường là URI Supabase cung cấp trong màn hình cấu hình Google Provider

Lưu ý:

- app hiện redirect người dùng về `/auth/callback`
- route này sẽ gọi `exchangeCodeForSession()`
- nếu callback/config sai, login Google sẽ fail dù env đã đúng

## Phase 3 - Tạo bảng `team_members`

Chạy SQL trong Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS team_members (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
  team TEXT NULL CHECK (team IN ('SepVinh', 'PM', 'BA', 'Growth', 'PD', 'BE', 'FE', 'QC', 'DevOps')),
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Seed tối thiểu 1 admin để vào được app:

```sql
INSERT INTO team_members (email, role, team, label, is_active)
VALUES ('your-email@company.com', 'admin', 'PM', 'Your Name', TRUE)
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  team = EXCLUDED.team,
  label = EXCLUDED.label,
  is_active = EXCLUDED.is_active;
```

## Phase 4 - Bật RLS tối thiểu cho `team_members`

Chạy tiếp:

```sql
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_members_select_own_row" ON team_members;

CREATE POLICY "team_members_select_own_row"
  ON team_members
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));
```

Ý nghĩa:

- browser client chỉ đọc row membership của chính user
- server routes vẫn dùng service role để verify quyền khi save

## Phase 5 - Verify theo đúng thứ tự

### Check 1 - App có mở được chưa

- chạy `npm run dev`
- mở trang chủ
- không còn lỗi `Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Check 2 - Google login có bật chưa

- bấm login Google
- nếu bị lỗi provider/callback thì quay lại Phase 2

### Check 3 - Email có được cấp quyền chưa

- login bằng email vừa seed
- nếu hiện lỗi kiểu "chưa được cấp quyền", kiểm tra:
  - email trong Google account có đúng với row trong `team_members` không
  - `is_active` có đang là `true` không

### Check 4 - Save route có chạy chưa

- sau khi login vào app
- thử edit một item
- nếu save lỗi `401/403`, kiểm tra lại:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - row `team_members`
  - role/team của user

## Cách hiểu đúng về từng biến env

### Public env

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Dùng cho:

- browser auth
- login Google
- client session
- lookup membership ở client

Thiếu 2 biến này -> app crash ngay lúc mở trang.

### Server env

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Dùng cho:

- API routes verify/save
- server-side permission check

Thiếu 2 biến này -> app có thể mở được nhưng save/auth server sẽ lỗi.

## Kết luận

Blocker trước mắt là **thiếu `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` trong `.env.local`**.

Thứ tự xử lý đúng là:

1. thêm 2 env public để app hết crash
2. bật Google Provider
3. tạo `team_members`
4. seed email admin
5. verify login và save

## Gợi ý follow-up

Sau khi setup xong, nên làm thêm:

- update `.env.example` để thêm `NEXT_PUBLIC_SUPABASE_URL`
- update `.env.example` để thêm `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- loại bỏ hoặc ghi chú rõ `EDITOR_PASSWORD` là config cũ, không còn dùng cho login mới
