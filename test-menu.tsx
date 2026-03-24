import React from 'react';
import { Conversations } from '@ant-design/x';

const items = [{ key: '1', label: '1' }];

export default function Test() {
  return <Conversations items={items} menu={(item) => ({ items: [{ key: '1', label: '1' }] })} />;
}
