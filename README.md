# 치킨무 놀이터 2 - 런처 배포 저장소

이 저장소는 **런처가 내려받는 파일 창고**입니다. 파일을 바꿔서 올리면(push) GitHub가 자동으로 목록(distribution.json)을 다시 만들고,
유저의 런처는 다음 실행 때 바뀐 것만 알아서 받습니다.

## 폴더 설명
| 위치 | 용도 |
|---|---|
| `mods/` | 서버 모드 (.jar). 추가/삭제/교체하면 유저 런처에 그대로 반영 |
| `defaults/` | 기본 옵션(options.txt, 셰이더 설정, 셰이더팩). **처음 한 번만** 적용되어 유저가 바꾼 설정은 유지 |
| `files/` | 매번 강제로 맞춰지는 파일 (예: 필수 리소스팩). 비어 있어도 됩니다 |
| `server.config.json` | 서버 이름/주소/마크 버전/메모리 등 |
| `icon.png` | 런처에 보이는 서버 아이콘 |

## 자주 하는 작업
- **모드 추가**: `mods/` 에 jar 업로드 → 끝
- **모드 삭제/교체**: 해당 jar 삭제 또는 새 버전 업로드 → 끝 (유저 PC에서도 자동 정리/교체)
- **유저 기본 옵션을 다시 적용하고 싶을 때**: `defaults/` 의 파일을 고치고 `server.config.json` 의 `defaultsVersion` 숫자를 올리기
- **마크 버전 변경**: `minecraftVersion` 수정 (모드도 해당 버전용으로 교체)

## 처음 설정 (1회)
1. GitHub에서 **Public** 저장소 생성 (예: `chickenmoo-files`)
2. 이 폴더의 내용을 전부 저장소에 업로드 (`.github` 폴더 포함)
3. 저장소 **Settings → Pages → Build and deployment → Source: GitHub Actions** 선택
4. **Actions** 탭에서 "런처 배포 파일 갱신" 이 초록색(성공)이 되면 완료
5. `https://아이디.github.io/저장소이름/distribution.json` 이 브라우저에서 열리면 정상
