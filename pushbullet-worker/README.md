# TNS Pushbullet 입금 감지 (Railway 배포)

PC 꺼져 있어도 24시간 신한은행 입금 SMS를 감지해서 Vercel 원장에 자동 등록합니다.

---

## 1. Railway 가입

1. https://railway.app 접속
2. **Login** → GitHub로 로그인 (무료 플랜 가능)

---

## 2. 새 프로젝트 만들기

1. **New Project** 클릭
2. **Deploy from GitHub repo** 선택
   - 이 폴더(`pushbullet-worker`)만 따로 배포하려면 **Empty Project** 선택 후 아래 "수동 배포" 참고
3. **또는** **Empty Project** 선택 후 수동 배포:

---

## 2-1. Empty Project로 수동 배포

1. **New** → **Empty Project**
2. 프로젝트 클릭 → **Add Service** → **GitHub Repo**
   - repo 연결이 안 되어 있으면 **Configure GitHub** 먼저
3. **Repo**: 본인 groupware 저장소 선택
4. **Root Directory**를 **반드시** `pushbullet-worker` 로 지정
   - 안 하면 Next.js가 배포되어 버림
5. **Deploy** (자동으로 빌드 시작)

---

## 2-2. GitHub에 pushbullet-worker만 별도 repo로 둔 경우

- 그 repo 연결 후 Root Directory 비우고 Deploy

---

## 3. 환경변수 설정

1. Railway 대시보드에서 방금 만든 **서비스** 클릭
2. **Variables** 탭
3. **New Variable** 또는 **RAW Editor**로 아래 추가:

| 이름 | 값 |
|------|-----|
| `PUSHBULLET_API_KEY` | Pushbullet 설정 → Access Tokens에서 생성한 토큰 (o.xxxx 형태) |

`WEBHOOK_URL`은 안 넣어도 됩니다. 기본값으로 Vercel 주소 쓰입니다.

---

## 4. Pushbullet 토큰 확인

1. https://www.pushbullet.com → 로그인
2. **Settings** → **Access Tokens** → **Create Access Token**
3. 이름 아무거나 (예: TNS Railway) → 생성된 토큰 복사
4. Railway Variables에 `PUSHBULLET_API_KEY` 로 붙여넣기

---

## 5. 배포 확인

1. Railway **Deployments** 탭에서 최신 배포 **View Logs** 클릭
2. 다음 로그가 보이면 성공:
   - `Pushbullet 연결 완료. 신한은행 입금 SMS 대기 중...`
3. 입금 SMS 한 통 보내서 테스트 → Vercel finance 페이지에서 새 행 추가되는지 확인

---

## 요약

| 단계 | 할 일 |
|------|--------|
| 1 | Railway 가입 (GitHub 로그인) |
| 2 | New Project → Empty → Add Service → GitHub Repo, **Root Directory: `pushbullet-worker`** |
| 3 | Variables에 `PUSHBULLET_API_KEY` = Pushbullet 토큰 |
| 4 | Deploy 후 로그에서 "연결 완료" 확인 |

이후엔 PC 꺼져 있어도 Railway가 24시간 스트림 유지 → 입금 시 자동 등록됩니다.
