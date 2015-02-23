import { readFileSync, writeFileSync } from 'fs'
import recast from 'recast'
import chalk from 'chalk'
import Parser from 'message-format/dist/parser'
import { getTranslate, getGetKey, getKeyNormalized } from './translate-util'
import Transpiler from './transpiler'
let builders = recast.types.builders
let Literal = recast.types.namedTypes.Literal.toString()
let TemplateLiteral = recast.types.namedTypes.TemplateLiteral.toString()


/**
 * Transforms source code, translating and inlining `format` calls
 **/
class Inliner {

	constructor(options={}) {
		this.formatName = options.functionName || 'format'
		this.getKey = getGetKey(options)
		this.translate = getTranslate(options)
		this.translations = options.translations
		this.locale = options.locale || 'en'
		this.functions = []
		this.currentFileName = null
	}


	lint({ sourceCode, sourceFileName }) {
		this.currentFileName = sourceFileName
		let
			inliner = this,
			ast = recast.parse(sourceCode)
		recast.visit(ast, {
			visitCallExpression(path) {
				this.traverse(path) // pre-travserse children
				if (inliner.isFormatCall(path)) {
					inliner.lintFormatCall(path)
				}
			}
		})
	}


	lintFormatCall(path) {
		let
			node = path.node,
			error,
			numErrors = 0
		if (!this.isString(node.arguments[0])) {
			this.reportWarning(path, 'Warning: called without a literal pattern')
			++numErrors
		}
		if (node.arguments[2] && !this.isString(node.arguments[2])) {
			this.reportWarning(path, 'Warning: called with a non-literal locale')
			++numErrors
		}

		if (
			this.isString(node.arguments[0])
			&& (error = this.getPatternError(this.getStringValue(node.arguments[0])))
		) {
			this.reportError(path, 'SyntaxError: pattern is invalid', error.message)
			return ++numErrors // can't continue validating pattern
		}

		if (this.isReplaceable(path) && this.translations) {
			let
				locale = node.arguments[2] ?
					this.getStringValue(node.arguments[2]) :
					this.locale,
				pattern = this.getStringValue(node.arguments[0]),
				translation = this.translate(pattern, locale)
			if (null == translation) {
				this.reportWarning(
					path,
					'Warning: no ' + locale + ' translation found for key ' +
						JSON.stringify(this.getKey(pattern))
				)
				++numErrors
			} else if ((error = this.getPatternError(translation))) {
				this.reportError(
					path,
					'SyntaxError: ' + locale + ' translated pattern is invalid for key ' +
						JSON.stringify(this.getKey(pattern)),
					error.message
				)
				++numErrors
			}
		}

		return numErrors
	}


	getLocation(path) {
		return (
			'\n    at ' + this.formatName + ' (' +
			this.currentFileName + ':' +
			path.node.loc.start.line + ':' +
			path.node.loc.start.column + ')'
		)
	}


	reportWarning(path, message) {
		let loc = this.getLocation(path)
		console.error(chalk.bold.yellow(message), chalk.yellow(loc))
	}


	reportError(path, message, submessage) {
		let loc = this.getLocation(path)
		if (submessage) {
			loc += '\n    ' + submessage
		}
		console.error(chalk.bold.red(message), chalk.red(loc))
	}


	extract({ sourceCode, sourceFileName }) {
		this.currentFileName = sourceFileName
		let
			inliner = this,
			patterns = {},
			ast = recast.parse(sourceCode)
		recast.visit(ast, {
			visitCallExpression(path) {
				this.traverse(path) // pre-travserse children
				if (inliner.isReplaceable(path)) {
					let
						pattern = inliner.getStringValue(path.node.arguments[0]),
						error = inliner.getPatternError(pattern)
					if (error) {
						inliner.reportError(path, 'SyntaxError: pattern is invalid', error.message)
					} else {
						let key = inliner.getKey(pattern)
						patterns[key] = getKeyNormalized(pattern)
					}
				}
			}
		})
		return patterns
	}


	inline({ sourceCode, sourceFileName, sourceMapName, inputSourceMap }) {
		this.functions.length = 0
		let
			inliner = this,
			ast = recast.parse(sourceCode, { sourceFileName })
		recast.visit(ast, {
			visitCallExpression(path) {
				this.traverse(path) // pre-travserse children
				if (inliner.isReplaceable(path)) {
					inliner.replace(path)
				}
			}
		})
		ast.program.body = ast.program.body.concat(this.getFunctionsStatements())

		sourceMapName = sourceMapName || (sourceFileName + '.map')
		return recast.print(ast, { sourceMapName, inputSourceMap })
	}


	getStringValue(literal) {
		if (literal.type === TemplateLiteral) {
			return literal.quasis[0].value.cooked
		}
		return literal.value
	}


	isFormatCall(path) {
		let node = path.node
		return (
			node.callee.name === this.formatName
		)
	}


	isString(node) {
		return node && (
			typeof node.value === 'string'
			|| (
				node.type === TemplateLiteral
				&& node.expressions.length === 0
				&& node.quasis.length === 1
			)
		)
	}


	getPatternError(pattern) {
		try {
			Parser.parse(pattern)
		} catch (error) {
			return error
		}
	}


	isReplaceable(path) {
		let node = path.node
		return (
			this.isFormatCall(path)
			// first argument is a literal string, or template literal with no expressions
			&& this.isString(node.arguments[0])
			&& (
				// no specified locale, or is a literal string
				!node.arguments[2]
				|| this.isString(node.arguments[2])
			)
		)
	}


	replace(path) {
		let
			node = path.node,
			locale = node.arguments[2] && this.getStringValue(node.arguments[2]) || this.locale,
			originalPattern = this.getStringValue(node.arguments[0]),
			pattern = this.translate(originalPattern, locale) || originalPattern,
			patternAst = Parser.parse(pattern),
			params = node.arguments[1],
			formatName = this.formatName,
			replacement

		if (patternAst.length === 1 && 'string' === typeof patternAst[0]) {
			replacement = builders.literal(patternAst[0])
		} else if (patternAst.length === 0) {
			replacement = builders.literal('')
		} else {
			let
				functionName = '$$message_format_' + this.functions.length,
				codeString = Transpiler.transpile(patternAst, { locale, formatName, functionName }),
				calleeExpr = builders.identifier(functionName),
				otherArguments = [
					params || builders.literal(null)
				]
			this.functions.push(codeString)

			replacement = builders.callExpression(
				calleeExpr, // callee
				otherArguments // arguments
			)
		}

		path.replace(replacement)
	}


	getFunctionsStatements() {
		let
			codeString = this.functions.join('\n'),
			codeAst = recast.parse(codeString)
		this.functions.length = 0
		return codeAst.program.body
	}


	static lint(source, options) {
		return new Inliner(options).lint(source)
	}


	static extract(source, options) {
		return new Inliner(options).extract(source)
	}


	static inline(source, options) {
		return new Inliner(options).inline(source)
	}


	static forEachFile(files, fn, ctx) {
		for (let file of files) {
			let source = file
			if ('string' === typeof file) {
				source = {
					sourceFileName: file,
					sourceCode: readFileSync(file, 'utf8')
				}
			}
			fn.call(ctx, source)
		}
	}


	static lintFiles(files, options) {
		let inliner = new Inliner(options)
		Inliner.forEachFile(files, function(source) {
			inliner.lint(source)
		})
	}


	static extractFromFiles(files, options) {
		let
			inliner = new Inliner(options),
			translations = {}
		Inliner.forEachFile(files, function(source) {
			let patterns = inliner.extract(source)
			Object.assign(translations, patterns)
		})
		let json = JSON.stringify({
			[inliner.locale]: translations
		}, null, '  ')
		if (options.outFile) {
			writeFileSync(options.outFile, json, 'utf8')
		} else {
			console.log(json)
		}
	}


	static inlineFiles(files, options) {
		let inliner = new Inliner(options)
		if (options.outDir) {
			Inliner.forEachFile(files, function(source) {
				let
					result = inliner.inline(source),
					outFileName = options.outDir + source.sourceFileName
				writeFileSync(outFileName, result.code, 'utf8')
			})
		} else if (options.outFile) {
			Inliner.forEachFile(files, function(source) {
				let result = inliner.inline(source)
				writeFileSync(options.outFile, result.code, 'utf8')
			})
		} else {
			Inliner.forEachFile(files, function(source) {
				let result = inliner.inline(source)
				console.log(result.code)
			})
		}
	}

}

export default Inliner

