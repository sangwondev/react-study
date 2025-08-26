# 팩토리 패턴

### → 팩토리 패턴은 객체(또는 리소스)를 만들어 반환하는 패턴이다.

생성 과정을 추상화하고 결과물만 받아서 쓸 때 사용한다. 

```tsx
// 간단 예: 브라우저용 Supabase 클라이언트 팩토리
export function createSupabaseBrowser() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: true },
  });
}
```

생성 로직과 옵션, 인자는 감추고 사용자는 완성품만 받아 쓰기 때문에 결합도를 낮출 수 있다.

## → 팩토리 패턴은 크게 3가지로 나뉜다.

### 1) 정적/함수형 팩토리(Simple Factory)

- 인자를 보고 무엇을 만들지 결정해서 반환한다.
- TS/JS에서 가장 자주 쓰이는 형태이다.

```tsx
type DbClient = { query: (sql: string) => Promise<any> }

export function createDbClient(kind: 'supabase' | 'memory', ctx?: any): DbClient {
  if (kind === 'supabase') {
    const sb = createSupabaseBrowser()
    return { query: (sql) => sb.rpc('run_sql', { sql }) } // 예시
  }
  // 테스트/로컬용 메모리 구현
  const data: any[] = []
  return { query: async () => data }
} 
```

→ kind 인자 설정으로 다른 결과물을 반환받는다. 한 번 정의하고 여러 용도로 활용할 수 있다.

### 2)  하위 클래스가 생성 책임(Factory Method)

- 상속/구현체가 생성 메서드를 오버라이드하는 OOP 패턴
- JS/TS에서는 클래스를 많이 쓰지 않아 잘 활용되지 않지만 Java에서는 자주 활용된다.

```tsx
abstract class Notifier {
  send(message: string) { /* 공통 로직 */ this.createTransport().deliver(message) }
  protected abstract createTransport(): { deliver: (msg: string) => void }
}

class EmailNotifier extends Notifier {
  protected createTransport() { return { deliver: (m) => console.log('EMAIL:', m) } }
}
class SlackNotifier extends Notifier {
  protected createTransport() { return { deliver: (m) => console.log('SLACK:', m) } }
}
```

→ 상위에서 공통 로직을 지정하고 하위 구현체에서 구현체들 간의 차이를 캡슐화하고 싶을 때 쓴다.

### 3) 추상 팩토리(Abstract Factory)

- 관련 객체를 세트로 만드는 인터페이스
- 목적에 따라 연관 객체들이 함께 바뀔 때 사용

```tsx
// 인터페이스(제품군)
interface Repos { users: UsersRepo; challenges: ChallengesRepo }

// 추상 팩토리
interface RepoFactory {
  createRepos(): Repos
}

// 구현 1: Supabase
class SupabaseRepoFactory implements RepoFactory {
  constructor(private sb: ReturnType<typeof createSupabaseBrowser>) {}
  createRepos(): Repos {
    return {
      users: { getMe: () => this.sb.from('users').select('*').single() },
      challenges: { list: () => this.sb.from('challenges').select('*') },
    }
  }
}

// 구현 2: Memory(테스트용)
class MemoryRepoFactory implements RepoFactory {
  createRepos(): Repos {
    const usersDb = [{ id: '1', name: 'dev' }]
    return {
      users: { getMe: async () => usersDb[0] },
      challenges: { list: async () => [] },
    }
  }
}

```

→ 테스트, CSR/SSR, 로컬 서버/클라우드 등 환경에 따라 여러 객체를 함께 교체해야 할 때 사용.

## 팩토리를 사용하기 좋을 때

- 복잡한 생성을 캡슐, 추상화(옵션, 분기, 캐싱)
- 환경에 따라 구현을 갈아 끼울 때(CSR/SSR, dev/prod, real/memory)
- 테스트에서 목 데이터를 쉽게 넣고 싶을 때
- 라이프사이클(싱글턴/요청 스코프/세션 스코프)을 중앙에서 통제하고 싶을 때

## Supabase/Next.js에서 실제로 활용하는 패턴

```tsx
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

```tsx
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
```

supabase의 디폴트 세팅은 CSR/SSR을 모두 같은 createClient()로 추상화하고 import로 분기한다.

### 추상 팩토리 패턴(제품군 교체)

```tsx
// lib/repos/factory.ts
export interface UsersRepo { getMe(): Promise<any> }
export interface ChallengesRepo { list(): Promise<any[]> }
export interface Repos { users: UsersRepo; challenges: ChallengesRepo }

export function createReposCSR(): Repos {
  const sb = supabaseBrowser
  return {
    users: { getMe: () => sb.from('users').select('*').single() },
    challenges: { list: () => sb.from('challenges').select('*') },
  }
}

export function createReposSSR(): Repos {
  const sb = supabaseServer()
  return {
    users: { getMe: () => sb.from('users').select('*').single() },
    challenges: { list: () => sb.from('challenges').select('*') },
  }
}
```

```tsx
// 서버 컴포넌트
const repos = createReposSSR()
const me = await repos.users.getMe()

// 클라이언트 컴포넌트
const repos = createReposCSR()
repos.challenges.list().then(...)
```

같은 결과값을 다른 프로세스를 통해 얻을 수 있다. supabase는 불가피한 경우를 제외하고 SSR을 권장한다.

### *주의

전역 싱글턴 남발 시 숨은 상태/경합 발생으로 디버깅이 어려워진다.

결합도를 낮추고 호출부를 간결하게 할 수 있을 때, 환경별 교체가 필요할 때, 라이프 사이클 통제가 필요할 때 사용한다.

### 사용 팁

내부에서 env를 사용하는 경우, 로컬 변수에 대한 읽기/접근을 최소하하기 위해 팩토리 패턴을 사용하자.

**스코프를 명확히: 브라우저에서는 싱글턴, 서버는 요청마다 (supabase)**

팩토리 파일은 한 곳에 모으고, 호출부는 완성품만 사용하는 게 좋다.
