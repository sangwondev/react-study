# Zod
타입스크립트 First로 고안된 유효성 검증 라이브러리. schema를 정의해 데이터 유효성을 검증할 수 있다. string에서 복잡한 객체까지 검증 가능.

## 사용법

### **스키마 정의하기**

```jsx
import * as z from "zod"; 
 
const Player = z.object({ 
  username: z.string(),
  xp: z.number()
});
```

사용하기에 앞서 스키마부터 정의한다.

### **데이터 파싱**

```jsx
Player.parse({ username: "billie", xp: 100 }); 
// => returns { username: "billie", xp: 100 }
```

`.parse` 를 사용해 인풋을 검증할 수 있다. 유효한 경우, Zod는 깊은 복사를 통해 강타입화된 인풋의 객체를 반환한다. 만약에 스키마가 `refinements` 나 `transform` 같은 비동기 API를 사용한다면 `.parseAsynce()` 메서드를 사용해야 한다.

```jsx
await Player.parseAsync({ username: "billie", xp: 100 }); 
```

### **에러 처리**

```jsx
try {
  Player.parse({ username: 42, xp: "100" });
} catch(error){
  if(error instanceof z.ZodError){
    error.issues; 
    /* [
      {
        expected: 'string',
        code: 'invalid_type',
        path: [ 'username' ],
        message: 'Invalid input: expected string'
      },
      {
        expected: 'number',
        code: 'invalid_type',
        path: [ 'xp' ],
        message: 'Invalid input: expected number'
      }
    ] */
  }
}
```

유효성 검증 실패 시 `.parse()` 메서드는 `ZodError` 객체를 반환한다. `ZodError.issues`에는 검증 이슈에 대한 정보가 포함된다.

```jsx
const result = Player.safeParse({ username: 42, xp: "100" });
if (!result.success) {
  result.error;   // ZodError instance
} else {
  result.data;    // { username: string; xp: number }
}
```

try/catch문을 피하고 싶다면 위와 같이 사용해도 된다. `.safeParse()` 가 일반적인 객체로 성공적으로 파싱된 데이터 또는 `ZodError` 를 래핑해 반환한다. 

```jsx
await schema.safeParseAsync("hello");
```

스키마가 비동기 API를 사용하면 마찬가지로 비동기 메서드를 사용해야 한다.

### **타입 추론**

```jsx
const Player = z.object({ 
  username: z.string(),
  xp: z.number()
});
 
// extract the inferred type
type Player = z.infer<typeof Player>;
 
// use it in your code
const player: Player = { username: "billie", xp: 100 };
```

조드는 스키마 정의에서 정적 타입 추론을 한다. `z.infer<>` 유틸리티로 `z.object` 의 타입을 추출해 type으로 정의한 뒤 사용할 수 있다.

```jsx
const mySchema = z.string().transform((val) => val.length);
 
type MySchemaIn = z.input<typeof mySchema>;
// => string
 
type MySchemaOut = z.output<typeof mySchema>; // equivalent to z.infer<typeof mySchema>
// number
```

위와 같이 스키마의 인풋과 아웃풋 타입이 다른 경우도 있다. `.transform()` 을 이용하면 위와 같은 스키마 타입 분화를 사용할 수 있다.

## 스키마 정의하기

Zod에서는 데이터 검증을 하려면 스키마부터 정의해야 한다. 스키마는 type으로 표현된다. 원시값부터 복잡한 객체값, 배열까지 다 허용한다.

```jsx
import * as z from "zod";
 
// primitive types
z.string();
z.number();
z.bigint();
z.boolean();
z.symbol();
z.undefined();
z.null();
```

### **인풋타입 강제하기**

```jsx
z.coerce.string();    // String(input)
z.coerce.number();    // Number(input)
z.coerce.boolean();   // Boolean(input)
z.coerce.bigint();    // BigInt(input)
```

`.coerce()` 를 사용해 인풋 타입을 강제할 수 있다.

```jsx
const schema = z.coerce.string();
 
schema.parse("tuna");    // => "tuna"
schema.parse(42);        // => "42"
schema.parse(true);      // => "true"
schema.parse(null);      // => "null"
```

`.coerce()` 로 인풋을 강제하면 위처럼 인풋 타입의 형변환이 자동으로 이뤄진다.

```jsx
const A = z.coerce.number();
type AInput = z.infer<typeof A>; // => number
 
const B = z.coerce.number<number>();
type BInput = z.infer<typeof B>; // => number
```

`coerce()` 된 스키마의 디폴트는 `unknown` 이다. 더 구체적인 인풋 타입을 부여하려면 제네릭 파라미터로 구체적인 인풋 타입을 명시하면 된다.

### **리터럴**

리터럴 스키마는 리터럴 타입으로 구분된다. 

```jsx
const tuna = z.literal("tuna");
const twelve = z.literal(12);
const twobig = z.literal(2n);
const tru = z.literal(true);
```

```jsx
z.null();
z.undefined();
z.void(); // equivalent to z.undefined()
```

```jsx
const colors = z.literal(["red", "green", "blue"]);
 
colors.parse("green"); // ✅
colors.parse("yellow"); // ❌
```

여러 개의 리터럴 값을 추출할 때는 다음과 같이 사용할 수 있다.

```jsx
colors.values; // => Set<"red" | "green" | "blue">
```

### 정리

스키마 정의, 타입 추출, 스키마를 통한 유효성 검증 개념을 파악한 상태에서 필요한 유효성 검증 학습, 적용
