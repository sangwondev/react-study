# 프론트 인증(Supabase)

## Authentication

`createClient()`는 값/옵션 세팅을 하는 “얇은 팩토리” 함수다. supabase 서버에 API 콜을 하는 함수가 아니다.

`createClient()`로 생성된 `SupabaseClient` 객체의 세션(로그인 상태)은 브라우저에서는 localStorage(또는 쿠키), 서버에서는 쿠키로 유지된다. 따라서 컴포넌트가 리렌더/언마운트 되는 것과 관계 없이 토큰이 저장소에 남아있고, 새로 만든 `SupabaseClient`가 그 토큰을 다시 읽어서 쓰는 방식으로 동작한다. 실제 API 콜은 `from(…).select()`, `auth.getUser()` 등의 메서드를 호출할 때만 발생한다.

### ↪️내부 흐름(로그인 → 다른 페이지에서 RLS 읽기)

1. **로그인** (`signInWithOAuth` → 콜백에서 `exchangeCodeForSession`)
    - Supabase가 **access_token/refresh_token**을 발급
    - 브라우저: 토큰을 **localStorage**(기본) 저장
    - App Router 서버 콜백 사용 시: **쿠키**에 저장(서버/클라 모두 접근 가능)
2. **페이지 전환**(랜딩/리더보드/마이페이지 등)
    - 새로 만든 SupabaseClient가 **저장된 토큰을 읽음**
        - 브라우저: localStorage → 자동 사용
        - 서버(RSC/Route): 쿠키에서 읽어 **Authorization: Bearer <access_token>** 헤더로 PostgREST 호출
3. **쿼리** (`supabase.from('table').select('*')`)
    - Supabase → **PostgRdEST**로 요청 전송(헤더에 JWT)
    - PostgreSQL → RLS 정책에서 **`auth.uid()`** 등으로 토큰의 사용자 ID/클레임 검사
    - 허용되면 행 반환, 아니면 401/403
4. **토큰 갱신**
    - access_token 만료 시, **refresh_token**으로 자동 갱신(클라 SDK가 처리)
    - 실패하면 세션 종료 이벤트 발생 → 로그인 요구

> 결론: “인증 컨텍스트 유지”는 클라이언트 싱글톤 + 저장된 토큰으로 해결. 매 렌더마다 서버에 콜을 보내지는 않는다(직접 호출하지 않는 한).
>

## 🍪쿠키

- **서버가 생성, 브라우저에 저장되는 작은 데이터 조각(최대 4KB 정도).**
- HTTP 요청을 보낼 때 **자동으로 같이 전송**돼서 서버가 “이 요청이 누구의 것인지” 식별할 수 있게 해줌.
- key=value 형태, 예:

```mathematica
Set-Cookie: sessionId=abc123; Path=/; HttpOnly; Secure
```

## 🔑 쿠키의 주요 속성 (실제로 자주 보는 것들)

| 속성 | 설명 |
| --- | --- |
| **Name=Value** | 쿠키의 기본 데이터 (예: `sessionId=abc123`). |
| **Domain** | 어떤 도메인에 이 쿠키를 보낼지 (`.example.com`). |
| **Path** | 어떤 경로에 이 쿠키를 보낼지 (`/api`). |
| **Expires / Max-Age** | 만료 시점 (세션 쿠키 vs 영속 쿠키). |
| **Secure** | HTTPS 연결일 때만 전송. |
| **HttpOnly** | JS `document.cookie`로 접근 불가 → **XSS 방지**. |
| **SameSite** | 크로스사이트 요청 시 전송 여부(`Strict`, `Lax`, `None`). CSRF 방지와 관련됨. |

## 🌐쿠키가 동작하는 흐름

1. **서버 → 브라우저**
    - 로그인 성공 시 서버가 응답 헤더에 `Set-Cookie`를 내려줌.

        ```
        Set-Cookie: access_token=jwt123; Path=/; HttpOnly; Secure
        ```

    - 브라우저는 이걸 저장.
2. **브라우저 → 서버**
    - 이후 같은 도메인으로 요청 시 자동으로 쿠키 첨부:

        ```
        Cookie: access_token=jwt123
        ```

    - → 서버는 이 값으로 사용자 인증 가능.
3. **쿠키 만료/삭제**
    - 브라우저가 쿠키 만료되면 안 보냄.
    - 서버가 `Set-Cookie`로 빈 값/만료 날짜를 내려서 지울 수도 있음.

## 🆚 세션 저장소(localStorage 등)와 차이

- **localStorage**: 브라우저 JS에서만 접근. API 요청 시 직접 헤더에 넣어야 함.
- **쿠키**: 브라우저가 자동으로 요청마다 전송. 특히 SSR 시 서버 코드에서도 읽을 수 있음.
- **Next.js + Supabase** 같은 환경에서는 쿠키 방식이 로그인 상태 유지에 유리.

# CSR/SSR OAuth2 로그인 문제 해결

# 웹 인증 디버깅: 브라우저부터 OAuth 2.0까지

supabase 서버에서 보낸 Implicit Grant 방식의 # 이하 code를 route.ts 내의 GET 함수가 인식하지 못해 에러 발생.

원인: 클라이언트 컴포넌트(`'use client'`)에서 시작된 인증 흐름을 서버 사이드 콜백(`route.ts`)에서 처리하려고 할 때, 양쪽의 인증 방식이 맞지 않아 발생. (CSR(Implicit Grant) ↔ SSR(PKCE))

디버깅 과정에서 부딪혔던 핵심적인 웹 기술 개념들을 정리.

---

### 1. URL의 구조

`https://example.com/path/to/page?query=123#section-1`

- **`https://`**: 프로토콜 (Protocol)
- **`example.com`**: 도메인 (Domain)
- **`/path/to/page`**: 경로 (Path)
- **`?query=123`**: **쿼리 문자열 (Query String)**
    - `?`로 시작하며, 서버에 추가적인 데이터를 전달하기 위해 사용.
    - `key=value` 형태로 구성되며, `&`로 여러 개를 연결할 수 있다.
    - **서버로 전송.** `route.ts`가 `code`를 받으려면 이 쿼리 문자열에 포함되어야 했다.
- **`#section-1`**: **프래그먼트 (Fragment) 또는 해시 (Hash)**
    - `#`로 시작하며, **오직 브라우저에서만 사용**. 주로 페이지 내 특정 위치로 스크롤하는 데 사용.
    - **해시 이하는 절대 서버로 전송되지 않는다.**
    - 이번 디버깅에서 Supabase가 `#access_token=...` 형태로 응답을 보냈기 때문에, Next.js 서버는 `access_token`의 존재 자체를 알 수 없었다. 이게 문제의 핵심.

### 2. 쿠키 (Cookies)

쿠키 = 브라우저에 저장되는 작은 텍스트 조각. 서버는 쿠키를 통해 사용자를 기억할 수 있다.

- **목적**: 로그인 상태 유지(세션 관리), 사용자 설정 기억, 활동 추적 등
- **동작**: 한번 저장된 쿠키는 동일한 도메인에 요청을 보낼 때마다 자동으로 함께 전송.
- **Next.js와 Supabase에서의 역할**: `@supabase/ssr` 라이브러리는 쿠키를 사용해 사용자의 로그인 세션 정보를 저장한다. 이를 통해 서버 컴포넌트, 클라이언트 컴포넌트, API 라우트 등 Next.js 앱의 모든 환경에서 사용자의 로그인 상태를 일관되게 유지할 수 있다.

### 3. OAuth 2.0 인증 흐름: Implicit Grant vs. PKCE

OAuth 2.0은 다른 서비스(구글, 페이스북 등)의 계정을 사용해 우리 서비스에 로그인할 수 있게 해주는 표준 프로토콜. 인증 정보를 교환하는 방식에 따라 여러 "흐름(Flow)"이 있다.

### 가. Implicit Grant Flow (오래된 방식)

- **개념**: 인증 서버가 `access_token`을 브라우저의 URL 프래그먼트(`#`)에 직접 담아 전달한다.
- **문제점**:
    - `access_token`이 브라우저 기록이나 URL에 직접 노출되어 보안에 취약.
    - URL 프래그먼트는 서버로 전송되지 않으므로, 서버 사이드 렌더링(SSR) 환경에서 토큰을 처리할 수 없다.
- **문제 상황**: Supabase가 이 방식으로 응답해 `#access_token=...`을 보냈고, 서버(`route.ts`)는 이를 받지 못함.

### 나. Authorization Code Grant with PKCE (최신/권장 방식)

- **개념**: 현재 가장 널리 쓰이는 안전한 방식으로, 두 단계에 걸쳐 인증 정보를 교환한다.
- **흐름**:
    1. **1단계 (프론트엔드 채널)**: 인증 서버가 임시 **`인증 코드(code)`*를 발급하여 URL 쿼리 파라미터(`?code=...`)에 담아 브라우저로 보냅니다. 이 `code`는 서버로 전송됩니다.
    2. **2단계 (백엔드 채널)**: 우리 앱의 서버(`route.ts`)가 이 `code`를 받아, 백그라운드에서 안전하게 인증 서버와 통신하여 최종적인 **`access_token`*으로 교환합니다.
- **장점**: `access_token`과 같은 민감한 정보가 브라우저에 직접 노출되지 않아 훨씬 안전합니다.
- **문제 해결**: SSR 로그인으로 **PKCE** 흐름을 사용하도록 설정을 변경, `route.ts`가 기대하는 대로 `?code=...`를 받도록 수정.

### 4. 개발자 도구(F12) Network 탭 활용법

네트워크 탭은 브라우저와 서버 간의 모든 통신을 보여줌.

- **`Preserve log` (로그 유지) 체크박스**: **가장 중요한 기능.** 페이지가 리디렉션될 때마다 네트워크 로그가 지워지는 것을 방지한다. 구글 로그인처럼 여러 번의 리디렉션이 발생하는 과정을 추적하려면 반드시 켜야함.
- **`Name` 컬럼**: 어떤 주소로 요청이 보내졌는지 목록을 보여준다.
- **`Status` 컬럼**: `200`(성공), `307`(임시 리디렉션) 등 HTTP 상태 코드를 보여줌. 리디렉션 흐름을 파악하는 데 필수.
- **`Headers` 탭**: 목록에서 특정 요청을 클릭하면 나타난다.
    - **Request URL**: 브라우저가 실제로 요청한 전체 URL. `?` 뒤의 쿼리 문자열과 `#` 뒤의 프래그먼트를 모두 확인할 수 있다.
    - **Request Method**: `GET`, `POST` 등
    - **Status Code**: 응답 상태

Network 탭을 통해 "Supabase가 우리 서버로 보내는 최종 URL에 `code`가 있는지, 아니면 `access_token`이 있는지를 명확히 확인할 수 있었다.

---

# CSR vs. SSR: 로그인 페이지로 보는 렌더링 전략

Next.js의 가장 큰 장점 중 하나는 페이지별로 렌더링 및 실행 전략을 선택할 수 있다는 점이다. 위 로그인 문제의도 클라이언트 사이드 렌더링(CSR) 방식과 서버 사이드 렌더링(SSR) 방식의 인증 흐름이 혼재되어 있었기 때문에 발생했다.

두 방식의 차이점을 명확히 구분하자.

---

### CSR과 SSR 핵심 요소 비교

| 구분 (Feature) | CSR (클라이언트 사이드) - **기존 방식** | SSR w/ Server Actions (서버 사이드) - **새 방식** |
| --- | --- | --- |
| **파일 지시어** | `'use client'` (파일 최상단에 명시) | (없음 - Next.js App Router의 기본값) |
| **주요 실행 위치** | 사용자 브라우저 | 웹 서버 |
| **상태 관리** | `useState` 훅으로 UI 상태 관리 (로딩, 에러 등) | URL 쿼리 파라미터 (`?error=...`) 또는 DB. UI 상태 저장을 최소화. |
| **이벤트 처리** | `onClick={handleSignIn}` 같은 이벤트 핸들러 사용 | `<form formAction={signInAction}>`으로 서버 액션 직접 호출 |
| **인증 로직** | 브라우저에서 Supabase 클라이언트 직접 호출 | 서버 액션(`'use server'`) 내에서 서버용 Supabase 클라이언트 호출 |
| **페이지 이동** | `window.location.href = '...'` 또는 `<Link>` | `redirect('...')` (서버가 브라우저에 리디렉션 명령) |
| **보안** | 민감한 로직이나 키가 노출될 위험 존재 | 안전. 모든 로직과 키가 서버에서만 실행 및 사용됨. |
| **데이터 흐름** | 이벤트 발생 → JS 핸들러 실행 → API 요청 → 상태 업데이트 → UI 변경 | `<form>` 제출 → 서버 액션 실행 → 서버에서 작업 수행 → 페이지 리디렉션 또는 리렌더링 |

---

### 코드 레벨에서 비교 분석

### 1. CSR (클라이언트 사이드) 구현 요소 - 기존 `login/page.tsx`

CSR 방식은 전통적인 React SPA(Single Page Application)와 유사하게 동작한다. 브라우저가 JS를 모두 다운로드한 후, 대부분의 로직을 브라우저에서 직접 처리한다.

```tsx
// 1. 'use client' 지시어로 이 컴포넌트가 브라우저에서 실행됨을 명시
'use client'

// 2. 브라우저 환경에서만 사용 가능한 훅(hook)으로 상태 관리
import { useState } from "react"

export default function LoginPage() {
  // 3. 모든 상태(입력값, 에러 메시지)를 브라우저 메모리에서 관리
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 4. 브라우저에서 실행될 이벤트 핸들러 함수
  const handleGoogleSignIn = async () => {
    // 5. 브라우저용 Supabase 클라이언트가 직접 API 호출
    const { data, error } = await supabase.auth.signInWithOAuth(...)
    if (error) {
      setError(error.message) // 상태 변경 -> UI 리렌더링
    }
  }

  return (
    // 6. onClick 이벤트에 핸들러를 직접 연결
    <button onClick={handleGoogleSignIn}>
      Sign in with Google
    </button>
  )
}

```

### 2. SSR (서버 사이드) 구현 요소 - 새로 만들 `login/page.tsx`와 `actions.ts`

SSR 방식은 Next.js의 서버 컴포넌트와 서버 액션을 적극적으로 활용한다. 브라우저는 단순히 UI를 보여주고 사용자 입력을 서버로 보내는 역할에 집중.

**`src/app/login/actions.ts` (서버 액션 파일)**

```tsx
// 1. 'use server' 지시어로 이 파일의 모든 함수가 서버에서만 실행됨을 명시
'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

// 2. 이 함수는 서버에서만 실행되므로, 민감한 로직이 포함되어도 안전
export async function googleSignIn() {
  // 3. 서버 환경 전용 Supabase 클라이언트 생성
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth(...)

  if (data.url) {
    // 4. 서버가 브라우저에게 "이 주소로 이동해"라고 명령 (리디렉션)
    redirect(data.url)
  }
}

```

**`src/app/login/page.tsx` (서버 컴포넌트)**

```tsx
// 1. 'use client' 없음 -> 서버 컴포넌트로 동작
import { googleSignIn } from './actions'

// 2. searchParams를 통해 URL 쿼리 파라미터(에러 메시지 등)를 읽음
export default function LoginPage({ searchParams }: { searchParams: { message?: string }}) {
  return (
    // 3. <form> 태그로 사용자 입력을 그룹화
    <form>
      {/* 이메일/비밀번호 입력 필드... */}

      // 4. button의 formAction 속성에 서버 액션을 직접 연결
      //    버튼 클릭 시, form 데이터와 함께 서버로 요청이 전송됨
      <button formAction={googleSignIn}>
        Sign in with Google
      </button>

      {searchParams.message && <p>{searchParams.message}</p>}
    </form>
  )
}

```

### 결론

로그인/회원가입처럼 보안이 중요하고 서버와의 통신이 필수적인 경우, Next.js에서는 **SSR과 서버 액션**을 사용하는 것이 권장된다. CSR 방식은 모든 로직이 클라이언트에 집중되어 상태 관리가 복잡해지고, 서버와의 인증 흐름이 꼬일 가능성이 있다. 최초 로그인을 비롯해 기본적인 인증은  SSR로 처리하되 필요한 부분만 CSR로 처리하는 게 좋다.
