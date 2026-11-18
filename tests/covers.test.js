import test from 'node:test';
import assert from 'node:assert/strict';
import { validISBN, coverISBN } from '../js/covers.js';
test('cover matching uses only checksum-valid deposited ISBNs', () => {
  assert.equal(validISBN('978-0-19-884546-1'), '9780198845461');
  assert.equal(validISBN('0-19-884546-4'), '0198845464');
  assert.equal(validISBN('9780198845460'), '');
  assert.equal(validISBN('9780198845461" onerror="bad'), '');
  assert.equal(coverISBN({ raw: { ISBN: ['bad', '9780198845461'] } }), '9780198845461');
  assert.equal(coverISBN({ raw: { title: ['Ancient Egypt'] } }), '');
});
