// Monkey kaomoji — the mood system
// Core aesthetic: monkey-face kaomoji (⊂...⊃ family) + expressive text faces

const MONKEY = [
  '⊂((・▽・))⊃',   // happy
  '⊂((≧▽≦))⊃',   // very happy
  '⊂((￣▽￣))⊃',   // content
  '⊂((・⊥・))⊃',   // neutral / curious
  '⊂((￣⊥￣))⊃',   // unimpressed
  '⊂((≧⊥≦))⊃',   // upset / crash
  '⊂((*＞⊥σ))⊃',   // shy / sorry
  '⊂((。・o・))⊃',   // surprised / oops
  '⊂((✧▽✧))⊃',   // excited / sparkly
  '⊂((･ω･))⊃',    // calm / chill
  '⊂((◉⊥◉))⊃',   // shocked
  '⊂((ᵔ▽ᵔ))⊃',   // warm smile
  '⊂((◕▽◕))⊃',   // cute / pleased
  '⊂((´･ω･`))⊃',  // sad / disappointed
  '⊂((¬‿¬))⊃',    // smug / cheeky
  '⊂((⚆▽⚆))⊃',    // thinking / intrigued
  '⊂((╥▽╥))⊃',   // touched / moved
]

const TEXT = {
  shrug: '¯\\_(ツ)_/¯',
  tableflip: '(╯°□°)╯︵ ┻━┻',
  tablefix: '┬─┬ ノ( ゜-゜ノ)',
  sparkles: '(✧ω✧)',
  cry: '(╥_╥)',
  yay: 'ヽ(>∀<☆)ノ',
  hmm: '🤔',
  ok: '👍',
}

export const kaomoji = {
  // Random monkey face
  random: () => MONKEY[Math.floor(Math.random() * MONKEY.length)],

  // Mood-specific monkey faces
  happy:    () => MONKEY.filter((_, i) => [0, 1, 2, 8, 11, 12].includes(i)),
  sad:      () => MONKEY.filter((_, i) => [9, 13].includes(i)),
  upset:    () => '⊂((￣⊥￣))⊃',
  crash:    () => '⊂((≧⊥≦))⊃',
  sorry:    () => '⊂((*＞⊥σ))⊃',
  surprised:() => '⊂((。・o・))⊃',
  excited:  () => '⊂((✧▽✧))⊃',
  thinking: () => '⊂((⚆▽⚆))⊃',
  warm:     () => '⊂((ᵔ▽ᵔ))⊃',
  cheeky:   () => '⊂((¬‿¬))⊃',

  // Non-monkey extras
  shrug:     () => TEXT.shrug,
  tableflip: () => TEXT.tableflip,
  tablefix:  () => TEXT.tablefix,
  sparkles:  () => TEXT.sparkles,
  cry:       () => TEXT.cry,
  yay:       () => TEXT.yay,
}
