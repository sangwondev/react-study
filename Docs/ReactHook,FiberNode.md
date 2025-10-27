# 훅과 파이버 노드

## JS의 실행 컨텍스트

- **스택(Stack)**: 함수 호출 시점의 *실행 컨텍스트(Execution Context)*
- **힙(Heap)**: 참조 타입(객체, 배열, 함수 등)이 저장

일급 객체인 함수를 포함한 모든 Object는 힙에 저장되고 실행 시에 스택 프레임에 들어간다.

`useEffect()` 실행을 살펴보자.

```tsx
useEffect(() => {
  const fetchContents = async () => {
    const contents = await getContents();
    setContents(contents);
  }
  fetchContents();
}, []);
```

이때 메모리 구조는 다음과 같다.

```lua
힙(Heap)
 ├─ FunctionObject(fetchContents)
 │   └─ [[Environment]] → useEffect의 렉시컬 환경 참조
 └─ 기타 함수/객체들

스택(Stack)
 └─ useEffect 콜백 실행 컨텍스트
     ├─ 변수: fetchContents (힙의 FunctionObject 참조)
     ├─ 변수: setContents (컴포넌트의 클로저 참조)
     └─ 기타 지역 변수들
```

함수 선언 자체는 힙에 저장되지만 함수의 참조는 스택에 저장된다. 

`useEffect` 콜백이 끝나면 스택은 사라지지만 해당 함수가 참조하는 상태(setContents)가 남아 있으면 GC가 회수하지 않게 된다(클로저).

## 리액트의 훅 저장

리액트는 JS의 프레임워크이기 때문에 결국 JS 엔진 위에서 동작한다. 리액트는 어떤 방식으로 기본적인 JS 코드 실행의 맥락에서 리액트의 실행 맥락을 관리할까?

→ 리액트가 별도로 관리하는 Fiber 구조(가상의 [스택 + 힙] 구조)를 통해서 관리한다.

- `useState` , `useEffect` , `useRef` 등의 훅들은 컴포넌트 인스턴스별로 React 내부의 힙에 저장된다.
- React는 컴포넌트 렌더링 시에 **훅 호출 순서**를 기준으로 데이터를 꺼낸다.
- 즉, **훅의 상태(state)**는 JS 엔진 스택이 아니라, 리액트의 힙에 보존된다.

> 컴포넌트 같은 렌더링 함수는 호출이 끝나면 스택에서 사라지지만,
그 안에서 사용된 `useState` 값은 React가 관리하는 별도의 힙에 저장되기에
리렌더링 시에 state를 복원할 수 있는 것이다.
> 

## JS 엔진 위의 개념적 가상 런타임 React

리액트는 JS엔진에 라이브러리 코드로 존재하는 가상 런타임이다.

따라서 JS엔의 호출 스택이나 GC를 직접 제어하는 대신 자신만의 런타임 구조를 JS엔진 힙에 구현하고 그 위에서 스택처럼 작동하는 시스템을 시뮬레이션한다.

이때 사용하는 가상 스택 구조가 **Fiber Tree**이다.

### Fiber = 컴포넌트 인스턴스의 상태를 보관하는 힙 객체

리액트는 컴포넌트가 렌더링 될 때마다 `FiberNode` 라는 객체를 만든다.

이 객체는 힙 메모리에 존재하며 하나의 컴포넌트 인스턴스가 하나의 노드가 된다.

```jsx
// FiberNode의 구조
{
  type: MyComponent,              // 컴포넌트 함수 자체
  memoizedState: null,            // 훅들의 상태 연결 리스트
  child: FiberNode | null,        // 자식 컴포넌트
  sibling: FiberNode | null,      // 형제 컴포넌트
  return: FiberNode | null,       // 부모 컴포넌트
  alternate: FiberNode | null,    // 이전 렌더링 스냅샷
  pendingProps: ...,              // 새로 들어온 props
  memoizedProps: ...,             // 이전 렌더링 props
}
```

**Fiber Tree는 이런 `FiberNode` 로 구성된 렌더 트리(객체 그래프)이자 리액트의 가상 스택 프레임이다.**

### memoizedState → 훅 연결 리스트 저장소

렌더링 시에 훅들이 순서대로 호출되면 리액트는 아래처럼 동작한다.

1. 현재 렌더 중인 `FiberNode` 를 `currentlyRenderingFiber` 전역 변수에 저장
2. 첫 번째 훅(`useState` 라고 가정) 호출 시, `Fiber.memoizedState` 에 새 Hook 객체 생성
3. 두 번째 훅은 `hook.next` 로 연결
4. 세 번째 훅도 `hook.next.next` … 이런 식으로 연결 리스트가 저장됨

각각의 훅 객체는 다음과 같은 형태이다.

```jsx
{
  memoizedState: <state or value>,  // useState의 현재 값
  queue: <updateQueue>,             // setState 호출 기록
  next: Hook | null,                // 다음 훅
}
```

memoizedState는 아래와 같은 구조의 훅 객체로 연결된 연결 리스트를 갖게 된다.

```jsx
Fiber.memoizedState → Hook1 → Hook2 → Hook3 → null
```

## 훅은 인덱스 순서로 동작

리액트는 다음과 같은 방법으로 훅 호출 순서를 스택처럼 엄격히 유지한다.

- 컴포넌트 함수가 실행될 때, “훅 호출 포인터” (`currentlyRenderingFiber.memoizedStateCursor`)를 0으로 초기화
- 훅이 호출될 때마다 +1 해가며 연결 리스트의 next 훅을 참조하거나 새로 만듦

렌더링 시마다 포인터는 0으로 초기화되고 기존 연결 리스트의 훅을 재사용한다.

```jsx
function Component() {
  const [a] = useState(0) // Hook index 0
  const [b] = useState(0) // Hook index 1
}
```

```scss
Fiber.memoizedState (head)
  ↓
Hook0 (for useState a)
  ↓
Hook1 (for useState b)
```

컴포넌트 재사용 시에 리액트는 기존의 훅 순서를 연결 리스트로 기억한다. 그렇기 때문에 훅의 순서가 바뀌면 알아차리고 경고를 띄운다.

## 정리

리액트는 힙 객체를 연결리스트로 묶어 스택처럼 순차 접근하는 방식으로 훅을 관리한다.

리액트의 어떤 기능이 스택 방식으로 동작한다고 하면 JS엔진의 스택 메모리에서 관리된다고 생각하면 안 된다. 
JS엔진의 힙 메모리 위에서, 리액트가 스택 시뮬레이터를 관리한다고 생각해야 한다.