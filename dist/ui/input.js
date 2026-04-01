import * as readline from 'readline';
import chalk from 'chalk';
export function askRaw(question) {
    return new Promise(resolve => {
        process.stdout.write(chalk.bold.rgb(232, 98, 42)(question));
        readline.emitKeypressEvents(process.stdin);
        if (process.stdin.isTTY)
            process.stdin.setRawMode(true);
        let input = '';
        const onKey = (_, key) => {
            if (key.ctrl && key.name === 'c') {
                process.stdout.write('\n');
                process.exit(0);
            }
            if (key.name === 'return') {
                process.stdin.removeListener('keypress', onKey);
                if (process.stdin.isTTY)
                    process.stdin.setRawMode(false);
                process.stdout.write('\n');
                resolve(input);
            }
            else if (key.name === 'backspace') {
                if (input.length > 0) {
                    input = input.slice(0, -1);
                    process.stdout.write('\x1B[1D \x1B[1D');
                }
            }
            else if (key.sequence && !key.ctrl && key.sequence >= ' ') {
                input += key.sequence;
                process.stdout.write(key.sequence);
            }
        };
        process.stdin.on('keypress', onKey);
    });
}
