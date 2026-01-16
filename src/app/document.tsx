import styles from "./styles.css?url";

export const Document: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <html lang="en" className="h-full">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Playwright Metrics</title>
      <link rel="modulepreload" href="/src/client.tsx" />
      <link rel="stylesheet" href={styles} />
    </head>
    <body>
      <div id="root">{children}</div>
      <script>import("/src/client.tsx")</script>
    </body>
  </html>
);
