import {spawn} from 'child_process';
import {startRemoteFixtureServer} from '../fixtures/remote-responses-server';

const port = Number(process.env.E2E_REMOTE_FIXTURE_PORT) || 18080;
const chatPort = port + 1;
const serial = process.env.E2E_DEVICE_UDID || 'emulator-5554';
const dryRun = process.argv.includes('--dry-run');

function run(
  command: string,
  args: string[],
  env = process.env,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {env, stdio: 'inherit'});
    child.once('error', reject);
    child.once('exit', code => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  if (dryRun) {
    console.log(
      `[remote-responses] dry run: adb -s ${serial} reverse tcp:${port} tcp:${port}`,
    );
    console.log(
      `[remote-responses] dry run: adb -s ${serial} reverse tcp:${chatPort} tcp:${port}`,
    );
    console.log(
      '[remote-responses] dry run: npx wdio wdio.android.local.conf.ts --spec specs/features/remote-responses.spec.ts',
    );
    console.log(
      '[remote-responses] dry run: npx wdio wdio.android.local.conf.ts --spec specs/features/remote-chat-fallback.spec.ts',
    );
    return;
  }
  const fixture = await startRemoteFixtureServer({port});
  console.log(`[remote-responses] fixture: ${fixture.url}`);
  try {
    const reverseCode = await run('adb', [
      '-s',
      serial,
      'reverse',
      `tcp:${port}`,
      `tcp:${port}`,
    ]);
    if (reverseCode !== 0) {
      throw new Error(`adb reverse failed for ${serial}`);
    }
    const chatReverseCode = await run('adb', [
      '-s',
      serial,
      'reverse',
      `tcp:${chatPort}`,
      `tcp:${port}`,
    ]);
    if (chatReverseCode !== 0) {
      throw new Error(`chat adb reverse failed for ${serial}`);
    }
    const specs = [
      'specs/features/remote-responses.spec.ts',
      'specs/features/remote-chat-fallback.spec.ts',
    ];
    for (const spec of specs) {
      const args = ['wdio', 'wdio.android.local.conf.ts', '--spec', spec];
      if (process.env.E2E_REMOTE_GREP && spec.includes('remote-responses')) {
        args.push('--mochaOpts.grep', process.env.E2E_REMOTE_GREP);
      }
      const code = await run('npx', args, {
        ...process.env,
        E2E_REMOTE_FIXTURE_URL: fixture.url,
        E2E_CHAT_FIXTURE_URL: `http://127.0.0.1:${chatPort}`,
        E2E_REMOTE_FIXTURE_PORT: String(port),
      });
      if (code !== 0) {
        process.exitCode = code;
        break;
      }
    }
  } finally {
    await run('adb', [
      '-s',
      serial,
      'reverse',
      '--remove',
      `tcp:${port}`,
    ]).catch(() => 1);
    await run('adb', [
      '-s',
      serial,
      'reverse',
      '--remove',
      `tcp:${chatPort}`,
    ]).catch(() => 1);
    await fixture.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
