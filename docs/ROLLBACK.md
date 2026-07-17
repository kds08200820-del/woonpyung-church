# 🚨 사고 발생 시 복구 절차 (ROLLBACK)

사이트가 깨졌거나, 데이터가 잘못 지워졌거나, 배포 후 문제가 생겼을 때 이 문서를 위에서부터 순서대로 따라가세요.

> **원칙: 가장 빠르고 안전한 것부터.**
> ① Vercel 롤백(1분, 코드만) → ② git revert(코드 원복) → ③ SQL 백업 복원(데이터) → ④ PITR(최후 수단, 데이터 전체)

---

## 0. 먼저 판단하기 — 무엇이 망가졌나?

| 증상 | 원인 | 해결 방법 |
|------|------|-----------|
| 배포 직후 화면이 깨짐, 버튼이 안 눌림 | **코드** 문제 | → 1번 (Vercel 롤백) |
| 며칠 전 커밋부터 문제가 있었음 | **코드** 문제 | → 2번 (git revert) |
| 교인 명단·게시글 등 **데이터**가 지워지거나 잘못됨 | **DB** 문제 | → 3번 (백업 복원) 또는 4번 (PITR) |

코드 문제는 DB를 건드리지 마시고, DB 문제는 코드를 건드리지 마세요.

---

## 1. Vercel에서 이전 배포로 즉시 롤백 (가장 빠름, 약 1분)

배포 직후 사이트가 이상할 때 **가장 먼저** 쓰는 방법입니다. 코드 수정 없이 클릭만으로 직전 정상 버전으로 되돌립니다.

1. [vercel.com](https://vercel.com) 접속 → 로그인
2. 해당 프로젝트 클릭
3. 상단 **Deployments** 탭 클릭
4. 목록에서 **문제가 없던 마지막 배포**(초록색 Ready, 문제 발생 이전 시각)를 찾기
5. 그 배포 오른쪽의 **`⋯`(점 3개) 메뉴** 클릭 → **Instant Rollback** 선택
   - 메뉴에 Instant Rollback이 없으면 **Promote to Production**을 선택해도 같은 효과
6. 확인 버튼 클릭 → 몇 초 안에 사이트가 이전 버전으로 돌아감
7. 사이트를 새로고침(Ctrl+Shift+R)해서 정상 확인

> ⚠️ 이것은 응급 처치입니다. GitHub의 코드는 그대로 문제 상태이므로, 진정된 뒤 2번(git revert)으로 코드도 되돌려야 합니다. 그러지 않으면 다음 배포 때 문제가 재발합니다.

---

## 2. git revert로 문제 커밋 되돌리기

문제를 일으킨 커밋을 "반대로 적용하는 새 커밋"을 만들어 안전하게 되돌립니다. 히스토리가 지워지지 않아 안전합니다.

터미널(또는 Claude Code)에서:

```bash
# 1) 최근 커밋 목록 보기 — 문제 커밋의 앞 7자리 코드(해시)를 확인
git log --oneline -10

# 2) 그 커밋 하나를 되돌리기 (abc1234 자리에 실제 해시 입력)
git revert abc1234

# 3) 여러 커밋을 한꺼번에 되돌리기 (오래된것..최신것 범위)
git revert --no-commit abc1234..def5678
git commit -m "문제 커밋 되돌리기"

# 4) GitHub에 올리면 Vercel이 자동으로 재배포
git push
```

> 💡 어떤 커밋이 문제인지 모르겠으면 Claude Code에게 "최근 커밋 중 ○○ 기능을 건드린 커밋을 찾아서 revert 해줘"라고 요청하세요.
>
> ⚠️ `git reset --hard`는 히스토리를 지우므로 쓰지 마세요. 항상 `revert`를 사용합니다.

---

## 3. Supabase 백업 파일로 복원하기

`npm run db:backup`으로 만들어 둔 `backups/backup_날짜시간.sql` 파일로 데이터를 복원합니다.

### 3-1. 특정 테이블만 잘못된 경우 (권장)

전체를 덮어쓰지 말고, 필요한 테이블만 복원하는 것이 안전합니다.

1. `backups/` 폴더에서 **문제 발생 이전의 가장 최근 백업 파일**을 메모장이나 VS Code로 열기
2. `-- ========== 2. 데이터 ==========` 아래에서 해당 테이블의 `INSERT` 구문들을 찾기 (Ctrl+F로 테이블명 검색)
3. [Supabase 대시보드](https://supabase.com/dashboard) → 프로젝트 → 왼쪽 메뉴 **SQL Editor**
4. 먼저 잘못된 데이터를 정리:
   ```sql
   -- 예: gyojeok 테이블을 비우고 다시 넣는 경우
   delete from public.테이블명;
   ```
5. 백업 파일에서 복사한 `INSERT` 구문들을 붙여넣고 **Run**
6. 사이트에서 데이터가 돌아왔는지 확인

> ⚠️ 복원 전에 반드시 `npm run db:backup`을 한 번 더 실행해서 **현재 상태도 백업**해 두세요. 복원이 잘못되어도 되돌릴 수 있습니다.

### 3-2. 전체 복원이 필요한 경우

백업 파일이 크거나 전체 복원이 필요하면 SQL Editor 대신 터미널에서 psql로 넣는 것이 확실합니다. 이 작업은 위험하므로 **Claude Code에게 맡기는 것을 권장**합니다:

> "backups/backup_○○○○.sql 파일로 프로덕션 DB를 복원해 줘. 실행 전에 계획을 먼저 보여줘."

---

## 4. Supabase PITR (특정 시점 복구) — 최후의 수단

PITR(Point-in-Time Recovery)은 DB 전체를 "사고 나기 직전 시각"으로 되돌리는 기능입니다. **그 시각 이후의 모든 변경(새 게시글, 새 교인 등록 등)도 함께 사라지므로** 최후의 수단으로만 사용하세요.

### 대시보드에서 위치 찾기

1. [supabase.com/dashboard](https://supabase.com/dashboard) 접속 → 로그인
2. 운평교회 프로젝트 클릭
3. 왼쪽 메뉴 맨 아래 **⚙ Project Settings** 아님 — 왼쪽 메뉴에서 **Database** 클릭
4. Database 메뉴 안의 **Backups** 클릭
   - 주소로 바로 가기: `https://supabase.com/dashboard/project/cetacttsdwzxjzkyozgd/database/backups`
5. 상단 탭에서:
   - **Scheduled backups**: 매일 자동 백업 목록 — 원하는 날짜 옆 **Restore** 버튼으로 그 날짜 상태로 복원
   - **Point in Time**: PITR — 사고 직전의 **정확한 날짜·시각(분 단위)**을 지정해서 복원

### 사용 시 주의

- PITR은 **유료 플랜 + PITR 애드온**이 켜져 있어야 사용 가능합니다. 탭이 비활성화되어 있으면 Scheduled backups(일 단위 복원)를 사용하세요.
- 복원 중에는 사이트가 몇 분간 멈춥니다. 새벽 시간대에 실행하는 것이 좋습니다.
- 복원 직전에 반드시 현재 시각을 메모해 두세요. (사라지는 데이터 범위를 알아야 교인들에게 안내할 수 있습니다)

---

## 평소에 해 둘 일 (사고 예방)

| 언제 | 할 일 | 명령 |
|------|-------|------|
| DB 구조를 바꾸기 **전** | 프로덕션 백업 | `npm run db:backup` |
| 매주 1회 (예: 월요일) | 정기 백업 | `npm run db:backup` |
| 새 SQL을 적용하기 전 | 로컬·프로덕션 차이 확인 | `npm run db:diff` |

### 최초 1회 준비 (아직 안 했다면)

백업 명령이 작동하려면 컴퓨터에 다음이 필요합니다:

```bash
# 1) 의존성 설치
npm install

# 2) Docker Desktop 설치 후 실행 (백업 도구가 내부적으로 사용)
#    https://www.docker.com/products/docker-desktop/

# 3) Supabase 로그인 및 프로젝트 연결
npx supabase login
npx supabase link --project-ref cetacttsdwzxjzkyozgd
```

> 💡 백업 파일(`backups/*.sql`)에는 교인 개인정보가 들어 있습니다. `.gitignore`에 등록되어 있어 GitHub에는 올라가지 않지만, 파일을 다른 곳에 복사하거나 공유하지 마세요.
