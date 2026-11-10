import React from 'react';
import { IconCopy } from '@tabler/icons-react';
import copy from 'copy-to-clipboard';

interface Props {
  data: string;
}

export default function CopyButton({ data }: Props) {
  return (
    <button
      title="Copy"
      onClick={() => copy(data)}
      style={{
        position: 'absolute', top: 8, right: 8,
        background: 'none', border: 'none', cursor: 'pointer', color: '#aaa'
      }}
    >
      <IconCopy size={20} />
    </button>
  );
}
