/** Case-insensitive match for “is this the same person name in credits?” (Trailer career highlight). */
export function careerPersonNameMatch(careerName: string, creditName: string): boolean {
  return careerName.trim().toLowerCase() === creditName.trim().toLowerCase()
}
