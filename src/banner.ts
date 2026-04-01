import chalk from 'chalk'

// Color per letter column: M O N K E Y
// Column boundaries measured from the figlet output
const COLS = [
  { color: chalk.bold.rgb(232, 98,  42),  start: 0,  end: 11  }, // M orange
  { color: chalk.bold.rgb(244, 160, 176), start: 12, end: 20  }, // O pink
  { color: chalk.bold.rgb(240, 183, 49),  start: 21, end: 31  }, // N yellow
  { color: chalk.bold.rgb(107, 140, 78),  start: 32, end: 40  }, // K green
  { color: chalk.bold.rgb(135, 206, 235), start: 41, end: 49  }, // E blue
  { color: chalk.bold.rgb(91,  184, 168), start: 50, end: 999 }, // Y teal
]

function colorLine(line: string): string {
  return line.split('').map((ch, i) => {
    const col = COLS.find(c => i >= c.start && i <= c.end)
    return col ? col.color(ch) : ch
  }).join('')
}

const KAOMOJI = [
  '⊂((￣⊥￣))⊃',
  '⊂((・⊥・))⊃',
  '⊂((≧⊥≦))⊃',
  '⊂((*＞⊥σ))⊃',
  '⊂((。・o・))⊃',
]

const BIG = [
  '███╗   ███╗ ██████╗ ███╗   ██╗██╗  ██╗███████╗██╗   ██╗',
  '████╗ ████║██╔═══██╗████╗  ██║██║ ██╔╝██╔════╝╚██╗ ██╔╝',
  '██╔████╔██║██║   ██║██╔██╗ ██║█████╔╝ █████╗   ╚████╔╝ ',
  '██║╚██╔╝██║██║   ██║██║╚██╗██║██╔═██╗ ██╔══╝    ╚██╔╝  ',
  '██║ ╚═╝ ██║╚██████╔╝██║ ╚████║██║  ██╗███████╗   ██║   ',
  '╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ╚═╝  ',
]

export function printBanner(model: string, version = '0.1.0'): void {
  const kaomoji = KAOMOJI[Math.floor(Math.random() * KAOMOJI.length)]
  console.log()
  BIG.forEach(line => console.log('  ' + colorLine(line)))
  console.log()
  console.log(
    '  ' + chalk.rgb(232, 98, 42)('the AI that evolves') +
    '    ' + chalk.rgb(245, 242, 235)(`v${version}`) +
    '  ' + chalk.rgb(107, 140, 78)('●') +
    ' ' + chalk.rgb(245, 242, 235)(model) +
    '    ' + chalk.rgb(240, 183, 49)(kaomoji)
  )
  console.log()
}
