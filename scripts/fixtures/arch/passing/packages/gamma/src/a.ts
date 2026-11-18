// 통과 픽스처 B5: 같은 패키지 안의 파일 순환은 패키지 순환이 아니다.
import { b } from "./b.ts";

export const a = () => b;
