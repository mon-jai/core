import * as os from 'os'
import * as path from 'path'

import {Config} from '../../src/config/config'
import {Plugin as IPlugin} from '../../src/interfaces'
import {Command} from '../../src/command'

import {expect, fancy} from './test'
import {Flags, Interfaces} from '../../src'

interface Options {
  pjson?: any;
  homedir?: string;
  platform?: string;
  env?: {[k: string]: string};
  commandIds?: string[];
  types?: string[];
}

class MyCommandClass extends Command {
  _base = ''

  aliases: string[] = []

  hidden = false

  id = 'foo:bar'

  flags = {}

  new(): Command {
    // @ts-ignore
    return {
      _run(): Promise<any> {
        return Promise.resolve()
      }}
  }

  run(): Promise<any> {
    return Promise.resolve()
  }
}

describe('Config with flexible taxonomy', () => {
  const testConfig = ({
    homedir = '/my/home',
    platform = 'darwin',
    env = {},
    commandIds = ['foo:bar', 'foo:baz'],
    types = [],
  }: Options = {}) => {
    let test = fancy
    .resetConfig()
    .env(env, {clear: true})
    .stub(os, 'homedir', () => path.join(homedir))
    .stub(os, 'platform', () => platform)

    const load = async (): Promise<void> => {}
    const findCommand = (): Promise<Command.Class> => {
      // @ts-ignore
      return Promise.resolve(new MyCommandClass([], {} as Config))
    }

    const commandPluginA: Command.Loadable = {
      strict: false,
      aliases: [],
      args: {},
      flags: {
        flagA: Flags.boolean({char: 'a'}),
        flagC: Flags.boolean({char: 'c'}),
      },
      hidden: false,
      id: commandIds[0],
      async load(): Promise<Command.Class> {
        // @ts-ignore
        return new MyCommandClass([], {} as Config)
      },
      pluginType: types[0] ?? 'core',
      pluginAlias: '@My/plugina',
    }
    const commandPluginB: Command.Loadable = {
      strict: false,
      aliases: [],
      args: {},
      flags: {
        flagB: Flags.boolean({}),
        flagC: Flags.boolean({aliases: ['ceeee']}),
      },
      hidden: false,
      id: commandIds[1],
      async load(): Promise<Command.Class> {
        // @ts-ignore
        return new MyCommandClass([], {} as Config)
      },
      pluginType: types[1] ?? 'core',
      pluginAlias: '@My/pluginb',
    }
    const hooks = {}
    const pluginA: IPlugin = {
      load,
      findCommand,
      name: '@My/plugina',
      alias: '@My/plugina',
      commands: [commandPluginA],
      _base: '',
      pjson: {} as any,
      commandIDs: [commandIds[0]] as string[],
      root: '',
      version: '0.0.0',
      type: types[0] ?? 'core',
      hooks,
      topics: [],
      valid: true,
      tag: 'tag',
    }

    const pluginB: IPlugin = {
      load,
      findCommand,
      name: '@My/pluginb',
      alias: '@My/pluginb',
      commands: [commandPluginB],
      _base: '',
      pjson: {} as any,
      commandIDs: [commandIds[1]] as string[],
      root: '',
      version: '0.0.0',
      type: types[1] ?? 'core',
      hooks,
      topics: [],
      valid: true,
      tag: 'tag',
    }
    const plugins: IPlugin[] = [pluginA, pluginB]

    test = test.add('config', async () => {
      const config = await Config.load()
      config.flexibleTaxonomy = true
      config.plugins = plugins
      config.pjson.oclif.plugins = ['@My/pluginb', '@My/plugina']
      config.pjson.dependencies = {'@My/pluginb': '0.0.0', '@My/plugina': '0.0.0'}
      for (const plugin of config.plugins) {
        // @ts-expect-error private method
        config.loadCommands(plugin)
        // @ts-expect-error private method
        config.loadTopics(plugin)
      }

      // @ts-expect-error private method
      config.loadConfigGraph()

      return config
    })
    // @ts-ignore
    return {
      it(expectation: string, fn: (config: Interfaces.Config) => any) {
        test
        .do(({config}) => fn(config))
        .it(expectation)
        return this
      },
    }
  }

  testConfig()
  .it('has populated topic index', config => {
    // @ts-expect-error because private member
    const topics = config._topics
    expect(topics.has('foo')).to.be.true
    expect(topics.has('foo:bar')).to.be.true
    expect(topics.has('foo:baz')).to.be.true
  })
  .it('has populated command permutation index', config => {
    // @ts-expect-error because private member
    const commandPermutations = config.commandPermutations
    expect(commandPermutations.get('foo')).to.deep.equal(new Set(['foo:bar', 'foo:baz']))
    expect(commandPermutations.get('foo:bar')).to.deep.equal(new Set(['foo:bar']))
    expect(commandPermutations.get('bar')).to.deep.equal(new Set(['foo:bar']))
    expect(commandPermutations.get('bar:foo')).to.deep.equal(new Set(['foo:bar']))
    expect(commandPermutations.get('foo:baz')).to.deep.equal(new Set(['foo:baz']))
    expect(commandPermutations.get('baz')).to.deep.equal(new Set(['foo:baz']))
    expect(commandPermutations.get('baz:foo')).to.deep.equal(new Set(['foo:baz']))
  })
  .it('has populated command index', config => {
    // @ts-expect-error because private member
    const commands = config._commands
    expect(commands.has('foo:bar')).to.be.true
    expect(commands.has('foo:baz')).to.be.true
  })
  .it('has all command id permutations', config => {
    expect(config.getAllCommandIDs()).to.deep.equal([
      'foo:bar',
      'foo:baz',
      'bar:foo',
      'baz:foo',
    ])
  })

  describe('findMatches', () => {
    testConfig()
    .it('finds command that contains a partial id', config => {
      const matches = config.findMatches('foo', [])
      expect(matches.length).to.equal(2)
    })
    .it('finds command that contains a partial id and matching full flag', config => {
      const matches = config.findMatches('foo', ['--flagB'])
      expect(matches.length).to.equal(1)
      expect(matches[0].id).to.equal('foo:baz')
    })
    .it('finds command that contains a partial id and matching short flag', config => {
      const matches = config.findMatches('foo', ['-a'])
      expect(matches.length).to.equal(1)
      expect(matches[0].id).to.equal('foo:bar')
    })
  })

  describe('findCommand', () => {
    testConfig()
    .it('find command with no duplicates', config => {
      const command = config.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })

    testConfig({commandIds: ['foo:bar', 'foo:bar']})
    .it('find command with duplicates and choose the one that appears first in oclif.plugins', config => {
      const command = config.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('pluginAlias', '@My/pluginb')
    })

    testConfig({types: ['core', 'user']})
    .it('find command with no duplicates core/user', config => {
      const command = config.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'core')
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })

    testConfig({types: ['user', 'core']})
    .it('find command with no duplicates user/core', config => {
      const command = config.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'user')
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })

    testConfig({commandIds: ['foo:bar', 'foo:bar'], types: ['core', 'user']})
    .it('find command with duplicates core/user', config => {
      const command = config.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'core')
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })

    testConfig({commandIds: ['foo:bar', 'foo:bar'], types: ['user', 'core']})
    .it('find command with duplicates user/core', config => {
      const command = config.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'core')
      expect(command).to.have.property('pluginAlias', '@My/pluginb')
    })

    testConfig({commandIds: ['foo:bar', 'foo:bar'], types: ['user', 'user']})
    .it('find command with duplicates user/user', config => {
      const command = config.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'user')
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })
  })
  describe('findCommand - graph', () => {
    testConfig()
    .it('find command with no duplicates', config => {
      const command = config.configGraph?.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })

    testConfig({commandIds: ['foo:bar', 'foo:bar']})
    .it('find command with duplicates and choose the one that appears first in oclif.plugins', config => {
      const command = config.configGraph?.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('pluginAlias', '@My/pluginb')
    })

    testConfig({types: ['core', 'user']})
    .it('find command with no duplicates core/user', config => {
      const command = config.configGraph?.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'core')
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })

    testConfig({types: ['user', 'core']})
    .it('find command with no duplicates user/core', config => {
      const command = config.configGraph?.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'user')
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })

    testConfig({commandIds: ['foo:bar', 'foo:bar'], types: ['core', 'user']})
    .it('find command with duplicates core/user', config => {
      const command = config.configGraph?.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'core')
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })

    testConfig({commandIds: ['foo:bar', 'foo:bar'], types: ['user', 'core']})
    .it('find command with duplicates user/core', config => {
      const command = config.configGraph?.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'core')
      expect(command).to.have.property('pluginAlias', '@My/pluginb')
    })

    testConfig({commandIds: ['foo:bar', 'foo:bar'], types: ['user', 'user']})
    .it('find command with duplicates user/user', config => {
      const command = config.configGraph?.findCommand('foo:bar', {must: true})
      expect(command).to.have.property('id', 'foo:bar')
      expect(command).to.have.property('pluginType', 'user')
      expect(command).to.have.property('pluginAlias', '@My/plugina')
    })

    testConfig({commandIds: ['foo:bar', 'foo:bar'], types: ['user', 'user']})
    .it('find matches', config => {
      const matches = config.configGraph?.findMatches('foo:bar', [])
      expect(matches).to.be.ok
      expect(matches).to.have.length(1)
      if (matches) {
        expect(matches[0]).to.have.property('id', 'foo:bar')
        expect(matches[0]).to.have.property('pluginType', 'user')
        expect(matches[0]).to.have.property('pluginAlias', '@My/plugina')
      }
    })
    testConfig({commandIds: ['foo:bar', 'foo:bar'], types: ['user', 'user']})
    .it('find matches - with flag', config => {
      const matches = config.configGraph?.findMatches('foo:bar', ['a'])
      expect(matches).to.be.ok
      expect(matches).to.have.length(1)
      if (matches) {
        expect(matches[0]).to.have.property('id', 'foo:bar')
        expect(matches[0]).to.have.property('pluginType', 'user')
        expect(matches[0]).to.have.property('pluginAlias', '@My/plugina')
      }
    })
    testConfig({commandIds: ['foo:bar', 'foo:baz'], types: ['user', 'user']})
    .it('find matches - same flag on different commands', config => {
      const matches = config.configGraph?.findMatches('foo', ['flagC'])
      expect(matches).to.be.ok
      expect(matches).to.have.length(2)
      if (matches) {
        expect(matches[0]).to.have.property('id', 'foo:bar')
        expect(matches[0]).to.have.property('pluginType', 'user')
        expect(matches[0]).to.have.property('pluginAlias', '@My/plugina')
      }
    })
    testConfig({commandIds: ['foo:bar', 'foo:baz'], types: ['user', 'user']})
    .it('find matches - same flag on different commands - using short char', config => {
      const matches = config.configGraph?.findMatches('foo', ['c'])
      expect(matches).to.be.ok
      expect(matches).to.have.length(2)
      if (matches) {
        expect(matches[0]).to.have.property('id', 'foo:bar')
        expect(matches[0]).to.have.property('pluginType', 'user')
        expect(matches[0]).to.have.property('pluginAlias', '@My/plugina')
      }
    })
    testConfig({commandIds: ['foo:bar', 'foo:baz'], types: ['user', 'user']})
    .it('find matches - same flag on different commands - using flag alias', config => {
      const matches = config.configGraph?.findMatches('foo', ['ceeee'])
      expect(matches).to.be.ok
      expect(matches).to.have.length(2)
      if (matches) {
        expect(matches[0]).to.have.property('id', 'foo:bar')
        expect(matches[0]).to.have.property('pluginType', 'user')
        expect(matches[0]).to.have.property('pluginAlias', '@My/plugina')
      }
    })
  })
})