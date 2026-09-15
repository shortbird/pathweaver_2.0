/**
 * "MOBILE" / "WEB" under a message bubble, for a superadmin only.
 *
 * The backend puts `sent_from` on a message row only when the viewer is a
 * superadmin (messaging_extras_service.enrich_messages), so for everyone else
 * there is nothing to render. The `visible` prop is the client's own gate on
 * top of that: a payload that reached a non-superadmin some other way still
 * shows nothing.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { SentFromTag } from '../MessageParts';

jest.mock('@/src/services/api', () =>
  require('@/src/__tests__/utils/mockApi').mockApiModule()
);

describe('SentFromTag', () => {
  it('names the surface for a superadmin', () => {
    const { getByText } = render(<SentFromTag sentFrom="mobile" isMine={false} visible />);
    expect(getByText('MOBILE')).toBeTruthy();
  });

  it('labels every surface the backend can stamp', () => {
    const { getByText } = render(
      <>
        <SentFromTag sentFrom="web" isMine visible />
        <SentFromTag sentFrom="sis" isMine visible />
        <SentFromTag sentFrom="email" isMine visible />
      </>
    );
    expect(getByText('WEB')).toBeTruthy();
    expect(getByText('SIS')).toBeTruthy();
    expect(getByText('EMAIL')).toBeTruthy();
  });

  it('renders nothing for a viewer who is not a superadmin', () => {
    const { queryByText } = render(<SentFromTag sentFrom="mobile" isMine={false} visible={false} />);
    expect(queryByText('MOBILE')).toBeNull();
  });

  it('renders nothing for a message from before the stamp existed', () => {
    const { toJSON } = render(<SentFromTag sentFrom={null} isMine={false} visible />);
    expect(toJSON()).toBeNull();
  });
});
