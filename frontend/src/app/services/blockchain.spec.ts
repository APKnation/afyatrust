import { BLOCKCHAIN_VIA_BACKEND } from './blockchain';

describe('blockchain', () => {
  it('routes all chain calls through the backend in the PoC', () => {
    expect(BLOCKCHAIN_VIA_BACKEND).toBe(true);
  });
});
