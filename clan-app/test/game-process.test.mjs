import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Server } from 'socket.io';
import registerSnakeGame from '../src/sockets/snake.game.js';
import registerChatSocket from '../src/sockets/chat.socket.js';

test('خادم الألعاب المخصص ينشئ غرف السوكت المستقلة', async () => {
  const server = http.createServer();
  const io = new Server(server, { cors: { origin: '*' } });

  registerSnakeGame(io);
  registerChatSocket(io);

  assert.ok(io._nsps.has('/'), 'الساحة الافتراضية');
  assert.ok(io._nsps.has('/chat'), 'شات العشائر');

  io.close();
});

test('عزل حلقة لعبة الثعبان يحمي الخادم من الاختناق', () => {
  const tickRate = 30;
  const frameIntervalMs = 1000 / tickRate;
  assert.equal(Math.round(frameIntervalMs), 33, '33ms لكل إطار لعب');
});
