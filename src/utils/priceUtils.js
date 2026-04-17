/**
 * 유효한 가격인지 검증
 * - null, undefined, 0, NaN, 음수 → false
 * - 양수 정수/소수 → true
 */
export const isValidPrice = (price) =>
  price !== null &&
  price !== undefined &&
  price !== 0 &&
  !isNaN(Number(price)) &&
  Number(price) > 0;
