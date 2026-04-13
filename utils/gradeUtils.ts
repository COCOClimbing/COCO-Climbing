export function vGradeToNum(grade: string): number {
  if (grade === 'VB') return -1;
  return parseFloat(grade.replace('V', '').replace('+', '.5')) || 0;
}

export function ydsGradeToNum(grade: string): number {
  const parts = grade.split('.');
  const main = parseInt(parts[1]) || 0;
  const sub = ['a', 'b', 'c', 'd'].indexOf(parts[2] || '');
  return main * 10 + (sub >= 0 ? sub : 0);
}

export function gradeToNum(grade: string, system: string): number {
  if (system === 'v-scale') return vGradeToNum(grade);
  if (system === 'yds') return ydsGradeToNum(grade);
  return 0;
}
