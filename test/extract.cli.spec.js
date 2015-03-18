import { exec } from 'child_process'
import { readFileSync, unlinkSync } from 'fs'

describe('format-message extract', () => {

	describe('input from stdin', () => {

		it('finds and extracts simple strings', done => {
			let input = 'formatMessage("hello")'
			exec('bin/format-message extract', (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en).to.eql({
					hello_32e420db: 'hello'
				})
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('finds and extracts template strings', done => {
			let input = 'formatMessage(`hello`)'
			exec('bin/format-message extract', (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en).to.eql({
					hello_32e420db: 'hello'
				})
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('dedupes repeated patterns', done => {
			let input = 'formatMessage("hello");formatMessage(`hello`)'
			exec('bin/format-message extract', (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en).to.eql({
					hello_32e420db: 'hello'
				})
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('can output to a -o file', done => {
			let
				input = 'formatMessage("hello");formatMessage(`hello`)',
				filename = 'test/translations/extract.underscored_crc32.json',
				cmd = 'bin/format-message extract -o ' + filename
			exec(cmd, (err, stdout, stderr) => {
				expect(stdout.toString('utf8')).to.equal('')
				expect(stderr.toString('utf8')).to.equal('')
				let translations = JSON.parse(readFileSync(filename, 'utf8'))
				unlinkSync(filename)
				expect(translations.en).to.eql({
					hello_32e420db: 'hello'
				})
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('can output to a --out-file file', done => {
			let
				input = 'formatMessage("hello");formatMessage(`hello`)',
				filename = 'test/translations/extract.underscored_crc32.json',
				cmd = 'bin/format-message extract --out-file ' + filename
			exec(cmd, (err, stdout, stderr) => {
				expect(stdout.toString('utf8')).to.equal('')
				expect(stderr.toString('utf8')).to.equal('')
				let translations = JSON.parse(readFileSync(filename, 'utf8'))
				unlinkSync(filename)
				expect(translations.en).to.eql({
					hello_32e420db: 'hello'
				})
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('uses specified -k key type', done => {
			let
				input = 'formatMessage("hello world");formatMessage(`hello world`)',
				cmd = 'bin/format-message extract -k underscored'
			exec(cmd, (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en).to.eql({
					hello_world: 'hello world'
				})
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('uses specified --key-type key type', done => {
			let
				input = 'formatMessage("hello world");formatMessage(`hello world`)',
				cmd = 'bin/format-message extract --key-type underscored'
			exec(cmd, (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en).to.eql({
					hello_world: 'hello world'
				})
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('finds -n named functions', done => {
			let
				input = '__("hello world");__(`hello world`)',
				cmd = 'bin/format-message extract -n __'
			exec(cmd, (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en).to.eql({
					hello_world_a55e96a3: 'hello world'
				})
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('finds --function-name named functions', done => {
			let
				input = '$("hello world");$(`hello world`)',
				cmd = 'bin/format-message extract --function-name $'
			exec(cmd, (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en).to.eql({
					hello_world_a55e96a3: 'hello world'
				})
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('writes to -l locale object', done => {
			let
				input = 'formatMessage("hello world")',
				cmd = 'bin/format-message extract -l pt'
			exec(cmd, (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.pt).to.eql({
					hello_world_a55e96a3: 'hello world'
				})
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			}).stdin.end(input, 'utf8')
		})


		it('writes to --locale locale object', done => {
			let
				input = 'formatMessage("hello world")',
				cmd = 'bin/format-message extract --locale en-US'
			exec(cmd, (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations['en-US']).to.eql({
					hello_world_a55e96a3: 'hello world'
				})
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			}).stdin.end(input, 'utf8')
		})

	})


	describe('reading from files', () => {

		it('can read from a single file', done => {
			let
				filename = 'test/format.spec.js',
				cmd = 'bin/format-message extract ' + filename
			exec(cmd, (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en.x_arg_z_c6ca7a80)
					.to.equal('x{ arg }z')
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			})
		})


		it('can read from multiple files', done => {
			let
				filename = 'test/setup.js test/format.spec.js',
				cmd = 'bin/format-message extract ' + filename
			exec(cmd, (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en.x_arg_z_c6ca7a80)
					.to.equal('x{ arg }z')
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			})
		})


		it('can read from a glob pattern of multiple files', done => {
			let
				filename = 'test/**/*.spec.js',
				cmd = 'bin/format-message extract ' + filename
			exec(cmd, (err, stdout, stderr) => {
				stdout = stdout.toString('utf8')
				let translations = JSON.parse(stdout)
				expect(translations.en.x_arg_z_c6ca7a80)
					.to.equal('x{ arg }z')
				expect(stderr.toString('utf8')).to.equal('')
				done(err)
			})
		})

	})

})

