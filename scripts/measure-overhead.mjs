#!/usr/bin/env node
/**
 * Snapshot the fixed context the plugin adds on every request: the prompt
 * section and the nine tool schemas. Tokenization happens in measure.py with
 * tiktoken so the numbers are reproducible on any machine.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTools } from '../lib/tools.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const out = join(root, '_artifacts', 'overhead.json')
mkdirSync(join(root, '_artifacts'), { recursive: true })

const source = readFileSync(join(root, 'index.js'), 'utf8')
const match = source.match(/const PROMPT_SECTION = (\[[\s\S]*?\])\.join\(' '\)/)
if (!match) throw new Error('PROMPT_SECTION array not found in index.js')
const promptText = new Function(`return ${match[1]}`)().join(' ')

const tools = createTools({ service: {} })
const schemas = tools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters,
}))

writeFileSync(out, `${JSON.stringify({ promptText, schemas }, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({
  out,
  promptChars: promptText.length,
  tools: schemas.length,
  schemaChars: schemas.reduce((sum, item) => sum + JSON.stringify(item).length, 0),
}))
