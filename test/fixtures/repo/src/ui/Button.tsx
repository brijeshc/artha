export function Button(props: { label: string }): JSX.Element {
  return <button type="button">{props.label}</button>;
}

export const PRIMARY = 'primary';
