CREATE TABLE branches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius_m INT NOT NULL DEFAULT 100
);

CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,        -- dạng 84xxxxxxxxx
  role TEXT NOT NULL,                -- trainer | reception | cleaner | manager
  branch_id INT REFERENCES branches(id),
  zalo_id TEXT UNIQUE,               -- gắn ở lần đăng nhập đầu
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(id),
  check_in TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out TIMESTAMPTZ,
  in_lat DOUBLE PRECISION, in_lng DOUBLE PRECISION,
  out_lat DOUBLE PRECISION, out_lng DOUBLE PRECISION
);
CREATE INDEX attendance_emp_checkin ON attendance (employee_id, check_in);

CREATE UNIQUE INDEX one_open_per_employee
  ON attendance (employee_id) WHERE check_out IS NULL;

-- Dữ liệu mẫu: SỬA trước khi chạy
INSERT INTO branches (name, lat, lng) VALUES ('Gym Cầu Giấy', 21.00217, 105.80333);
INSERT INTO employees (name, phone, role, branch_id)
VALUES ('Nguyễn Văn A', '84000000000', 'manager', 1);