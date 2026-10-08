import assert from 'node:assert/strict'
import { formatEnsemble, parseEnsemble, parseHostToken } from '../shared/hosts.ts'
import { pathMatchesKeyword } from '../shared/search.ts'
import { parseSrvr, readSrvrLatencyAvg } from '../electron/zk/four-letter.ts'

const ensemble = parseEnsemble('zk1:2181, zk2:2182, zk3', 2181)
assert.deepEqual(ensemble, [
  { host: 'zk1', port: 2181 },
  { host: 'zk2', port: 2182 },
  { host: 'zk3', port: 2181 },
])
assert.equal(formatEnsemble(ensemble), 'zk1:2181,zk2:2182,zk3:2181')
assert.deepEqual(parseHostToken('[::1]:2181', 2181), { host: '::1', port: 2181 })
assert.deepEqual(parseHostToken('::1', 2181), { host: '::1', port: 2181 })
assert.equal(parseHostToken('zk1:99999', 2181), null)
assert.deepEqual(parseEnsemble('', 2181), [])

assert.equal(pathMatchesKeyword('/zookeeper/config', 'zoo'), false)
assert.equal(pathMatchesKeyword('/zookeeper', 'zoo'), true)
assert.equal(pathMatchesKeyword('/a/foo', 'foo'), true)
assert.equal(pathMatchesKeyword('/foo/bar', 'foo'), false)
assert.equal(pathMatchesKeyword('/a/foo/bar', '/foo/bar'), true)
assert.equal(pathMatchesKeyword('/foo/bar/baz', '/foo/bar'), false)
assert.equal(pathMatchesKeyword('/', '/'), true)
assert.equal(pathMatchesKeyword('/services', '  '), false)

const srvr = parseSrvr('Latency min/avg/max : 0/12/40\nMode: follower\nNode count: 4\n')
assert.equal(readSrvrLatencyAvg(srvr), 12)
assert.equal(srvr.mode, 'follower')
assert.equal(srvr.node_count, '4')
assert.equal(readSrvrLatencyAvg({}), undefined)

console.log('logic-check ok')
