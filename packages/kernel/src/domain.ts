// 도메인 기반 — 식별자·시각 타입과 값 객체·엔터티·애그리거트 루트.
// 이벤트 검증과 버전 증가 규칙은 이 파일의 책임이 아니다.

/** uuid v7 문자열. 형식을 검증하지 않는다. */
export type Uuid = string;

/** 밀리초 정밀 UTC 시각. */
export type Instant = Date;

/** outbox 로 직렬화되는 평면 데이터다. 모듈 이벤트는 이것을 확장한다. */
export interface DomainEvent {
	readonly eventId: Uuid;
	readonly type: string;
	readonly schemaVersion: number;
	readonly occurredAt: Instant;
	readonly aggregateId: Uuid;
	readonly aggregateVersion: number;
}

/**
 * 값으로만 같음을 판정하는 객체.
 * 복합 값을 가진 하위 클래스는 `equals` 를 덮어쓴다.
 * `Date`·`Instant` 필드도 `equals` 를 덮어쓴다 — 기본 비교는 `Object.is` 라 같은 시각의 두 `Date` 가 다르다고 나온다.
 */
export abstract class ValueObject<T> {
	readonly value: T;

	protected constructor(value: T) {
		this.value = value;
	}

	equals(other: ValueObject<T>): boolean {
		return (
			other.constructor === this.constructor &&
			Object.is(this.value, other.value)
		);
	}
}

/** 식별자로 구분되는 객체. */
export abstract class Entity<Id> {
	readonly id: Id;

	protected constructor(id: Id) {
		this.id = id;
	}
}

/** 일관성 경계의 루트. 도메인 이벤트를 모았다가 한 번에 꺼내 준다. */
export abstract class AggregateRoot<Id> extends Entity<Id> {
	readonly #version: number;
	#pending: DomainEvent[] = [];

	protected constructor(id: Id, version: number) {
		super(id);
		this.#version = version;
	}

	get version(): number {
		return this.#version;
	}

	protected record(event: DomainEvent): void {
		this.#pending.push(event);
	}

	/** 기록 순서대로 돌려주고 보류 목록을 비운다. 다음 호출은 빈 배열이다. */
	pullEvents(): readonly DomainEvent[] {
		const events = this.#pending;
		// 내부 배열을 내주고 새 배열로 바꿔, 호출자가 받은 배열이 이후 기록과 얽히지 않게 한다.
		this.#pending = [];
		return events;
	}
}
