import { Card, CardHeader, CardBody, CardFooter, CardTitle, Button } from 'optio-design-system';

export const WithHeaderAndFooter = () => (
  <div style={{ width: 360 }}>
    <Card variant="elevated">
      <CardHeader gradient>
        <CardTitle>Personal Finance</CardTitle>
      </CardHeader>
      <CardBody>
        <p style={{ color: '#4b5563', fontSize: 14, lineHeight: 1.5 }}>
          Learn to budget, save, and invest through real-world projects you choose. Document
          your work as you go and earn credit for what you actually do.
        </p>
      </CardBody>
      <CardFooter>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="sm">Start class</Button>
        </div>
      </CardFooter>
    </Card>
  </div>
);

export const Variants = () => (
  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
    {(['elevated', 'outlined', 'flat'] as const).map((v) => (
      <div key={v} style={{ width: 200 }}>
        <Card variant={v}>
          <CardTitle size="sm">{v}</CardTitle>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>
            The {v} card surface.
          </p>
        </Card>
      </div>
    ))}
  </div>
);

export const Padding = () => (
  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
    {(['sm', 'md', 'lg'] as const).map((p) => (
      <div key={p} style={{ width: 180 }}>
        <Card variant="outlined" padding={p}>
          <span style={{ fontSize: 13, color: '#374151' }}>padding=&quot;{p}&quot;</span>
        </Card>
      </div>
    ))}
  </div>
);
