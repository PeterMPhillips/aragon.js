export default function (request, proxy, wrapper) {
  const operation = request.params[0]
  console.log('Operation: ', operation)

  if (operation === 'subscribe') {
    return wrapper.tokens.observe()
  }

  if (operation === 'register') {
    const address = request.params[1]
    return wrapper.registerToken(address)
  }

  return Promise.reject(
    new Error('Invalid token registry operation')
  )
}
