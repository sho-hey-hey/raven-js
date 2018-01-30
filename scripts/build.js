const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const chalk = require('chalk');

const rollup = require('rollup').rollup;
const rollupResolve = require('rollup-plugin-node-resolve');
const rollupCommonjs = require('rollup-plugin-commonjs');
const rollupUglify = require('rollup-plugin-uglify');

const PACKAGES_DIR = path.resolve(__dirname, '../packages');

function getPackages() {
  return fs
    .readdirSync(PACKAGES_DIR)
    .map(file => path.resolve(PACKAGES_DIR, file))
    .filter(f => fs.lstatSync(path.resolve(f)).isDirectory());
}

function runCommand(cmd = __dirname, args, cwd) {
  console.log(chalk.dim('$ cd ' + cwd + `\n$ ${cmd} ${args.join(' ')}`));
  const result = childProcess.spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit'
  });
  if (result.error) {
    console.log(result.error);
    console.log(chalk.dim('Error running command.'));
    process.exit(1);
  }
}

function compileTypeScript(packageRoot) {
  const bin = path.resolve(__dirname, '../node_modules/.bin/tsc');
  runCommand(bin, ['-p', 'tsconfig.json'], packageRoot);
}

function bundleRollup(packageRoot) {
  const pkgJsonPath = path.resolve(packageRoot, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return;
  const browser = require(pkgJsonPath).browser;
  if (!browser) return;

  return rollup({
    input: path.resolve(packageRoot, 'build/standalone.js'),
    plugins: [
      rollupResolve({
        jsnext: true,
        main: true,
        browser: true
      }),
      rollupCommonjs(),
      rollupUglify()
    ]
  }).then(bundle => {
    return bundle.write({
      file: path.resolve(packageRoot, browser),
      format: 'cjs',
      name: packageRoot.split('/').pop(),
      exports: 'named'
    });
  });
}

function checkSize(packageRoot) {
  const pkgJsonPath = path.resolve(packageRoot, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) return;
  const pkg = require(pkgJsonPath);
  if (!pkg.browser) return;
  const cmd = `cat ${path.resolve(packageRoot, pkg.browser)} | gzip -9 | wc -c | awk '{$1=$1/1024; print $1,\"kB\";}'`;
  console.log(
    chalk.dim(
      `${pkg.name}: ${childProcess.execSync(cmd, {
        encoding: 'utf8'
      })}`
    )
  );
}

function buildPackage(package) {
  compileTypeScript(package);
  bundleRollup(package);
  checkSize(package);
}

const package = process.argv[2];
if (package) {
  const packageRoot = path.resolve(PACKAGES_DIR, package);
  buildPackage(packageRoot);
} else {
  const packages = getPackages();
  process.stdout.write(chalk.inverse(' Building packages \n'));
  packages.forEach(buildPackage);
}
