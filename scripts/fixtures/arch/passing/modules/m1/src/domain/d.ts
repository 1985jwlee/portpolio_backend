// 통과 픽스처: 인자가 있는 날짜 생성은 값 변환이라 시간 직접 호출이 아니다.
export const d = 1;
export const t = (value: number) => new Date(value);
