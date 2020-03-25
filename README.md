# useStation

**useStation** is React hooks to fetch and process data from [fcd](https://github.com/terra-project/fcd).

If developers install this project from npm and use it, they can easily build a web-app like [Terra Station](https://station.terra.money) with [React](https://reactjs.org/).

## Getting Started

Install to your React project using npm:

```sh
npm install @terra-money/use-native-station
```

Declare your domain like below to solve CORS problem:

```
https://local.terra.money
```

Basic sample:

```tsx
import React, { useMemo } from 'react'
import { View, Text } from 'react-native'
import { useConfigState, ConfigProvider } from '@terra-money/use-native-station'
import { useDashboard, DashboardUI } from '@terra-money/use-native-station'

const Dashboard = () => {
  const { error, loading, ui } = useDashboard()

  const render = ({ prices: { title, display } }: DashboardUI) => {
    const { value, unit } = display
    return (
      <View>
        <Text>{title}</Text>
        <Text>{[value, unit].join(' ')}</Text>
      </View>
    )
  }

  return (
    <View>
      {error ? (
        <Text>{error.message}</Text>
      ) : loading ? (
        <Text>Loading...</Text>
      ) : (
        ui && render(ui)
      )}
    </View>
  )
}

const chain = {
  key: 'columbus',
  name: 'columbus-3',
  hostname: 'fcd.terra.dev',
  port: 443,
  secure: true
}

const App = () => {
  const config = useConfigState({ chain })

  return (
    <ConfigProvider value={config}>
      {config.chain.current.key && config.lang.current && <Dashboard />}
    </ConfigProvider>
  )
}

export default App
```

## Available Scripts

This project was bootstrapped with [tsdx](https://npm.im/tsdx).

In the project directory, you can run:

### `npm start` or `yarn start`

Runs the project in development/watch mode.

### `npm run build` or `yarn build`

Bundles the package to the dist folder.

### `npm test` or `yarn test`

Runs the test watcher (Jest) in an interactive mode.

### `npm run lint` or `yarn lint`

Runs Eslint with Prettier on .ts and .tsx files.
