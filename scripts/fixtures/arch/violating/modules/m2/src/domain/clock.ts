// 위반 픽스처 B2-time-random: 시간·난수를 직접 부르는 네 줄.
export const a = Date.now();
export const b = new Date();
export const c = Math.random();
export const d = crypto.randomUUID();
