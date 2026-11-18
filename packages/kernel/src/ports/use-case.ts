import type { AppError } from "../errors.ts";
import type { Result } from "../result.ts";

// Ctx 를 열어 둔 것은 ActorContext 의 자리가 아직 없어서다.
// 메서드 매개변수 이변성 덕에 구현 클래스는 ctx 를 더 좁은 타입으로 선언해도 된다.
export interface UseCase<In, Out, Ctx = unknown> {
	execute(ctx: Ctx, input: In): Promise<Result<Out, AppError>>;
}

export interface CommandHandler<C, R, Ctx = unknown>
	extends UseCase<C, R, Ctx> {}

export interface QueryHandler<Q, R, Ctx = unknown> extends UseCase<Q, R, Ctx> {}

// 소비자가 받는 것은 DomainEvent 가 아니라 봉투이므로 E 를 묶지 않는다.
export interface EventHandler<E, Ctx = unknown> extends UseCase<E, void, Ctx> {
	readonly consumer: string;
}
