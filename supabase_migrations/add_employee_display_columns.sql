-- employees 테이블에 표시용 컬럼 추가
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS position text,
  ADD COLUMN IF NOT EXISTS position_display text,
  ADD COLUMN IF NOT EXISTS display_department text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS employment_status text DEFAULT '재직';

-- DUMMY_USERS 데이터 마이그레이션 (emp_number 기준)
UPDATE employees SET position='CEO',                       display_department='경영',         phone='010-1234-5001', employment_status='재직' WHERE emp_number='TNS-20161104';
UPDATE employees SET position='CFO',                       display_department='경영',         phone='010-1234-5002', employment_status='재직' WHERE emp_number='TNS-20170102';
UPDATE employees SET position='맞춤형 홈페이지 제작', position_display='팀장', display_department='티제이웹',       phone='010-7197-2922', employment_status='재직' WHERE emp_number='TNS-20190709';
UPDATE employees SET position='이커머스 운영 관리', position_display='팀장', display_department='마케팅사업부', phone='010-4032-9187', employment_status='재직' WHERE emp_number='TNS-20220117';
UPDATE employees SET position='이커머스 운영 관리', position_display='총괄', display_department='마케팅사업부', phone='010-7167-4881', employment_status='재직' WHERE emp_number='TNS-20250201';
UPDATE employees SET position='경영지원',               position_display='총괄', display_department='경영지원',    phone='010-6604-5755', employment_status='재직' WHERE emp_number='TNS-20210125';
UPDATE employees SET position='이커머스 운영 관리', position_display='사원', display_department='마케팅사업부', phone='010-2822-8057', employment_status='재직' WHERE emp_number='TNS-20220801';

-- leave_requests의 applicant_id를 레거시 "1"~"7"에서 DB UUID로 마이그레이션
UPDATE leave_requests SET applicant_id = (SELECT id::text FROM employees WHERE emp_number='TNS-20161104' LIMIT 1) WHERE applicant_id = '1';
UPDATE leave_requests SET applicant_id = (SELECT id::text FROM employees WHERE emp_number='TNS-20170102' LIMIT 1) WHERE applicant_id = '2';
UPDATE leave_requests SET applicant_id = (SELECT id::text FROM employees WHERE emp_number='TNS-20190709' LIMIT 1) WHERE applicant_id = '3';
UPDATE leave_requests SET applicant_id = (SELECT id::text FROM employees WHERE emp_number='TNS-20220117' LIMIT 1) WHERE applicant_id = '4';
UPDATE leave_requests SET applicant_id = (SELECT id::text FROM employees WHERE emp_number='TNS-20250201' LIMIT 1) WHERE applicant_id = '5';
UPDATE leave_requests SET applicant_id = (SELECT id::text FROM employees WHERE emp_number='TNS-20210125' LIMIT 1) WHERE applicant_id = '6';
UPDATE leave_requests SET applicant_id = (SELECT id::text FROM employees WHERE emp_number='TNS-20220801' LIMIT 1) WHERE applicant_id = '7';
