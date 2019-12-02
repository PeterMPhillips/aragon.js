import { fromEvent } from 'rxjs'
import { filter, first } from 'rxjs/operators'
import BigNumber from 'bignumber.js'
import tokenDecimalsAbi from '../../../abi/tokens/token-decimals.json'
import tokenNameAbi from '../../../abi/tokens/token-name.json'
import tokenSymbolAbi from '../../../abi/tokens/token-symbol.json'
import tokenBalanceAbi from '../../../abi/tokens/token-balanceof.json'
import tokenEventsAbi from '../../../abi/tokens/token-events.json'


const tokenAbi = [].concat(tokenDecimalsAbi, tokenNameAbi, tokenSymbolAbi, tokenBalanceAbi, tokenEventsAbi)

export default async function (request, proxy, wrapper) {
  const operation = request.params[0]
  console.log('Operation: ', operation)

  if (operation === 'subscribe') {
    return wrapper.tokens.subscribe()
  }

  if (operation === 'register') {
    try {
      const address = request.params[1]
      const web3 = wrapper.web3
      const contract = new web3.eth.Contract(
        tokenAbi,
        address
      )

      //Get initial values
      const apps = await wrapper.apps.pipe(first()).toPromise()
      const vault = apps[apps.findIndex(app => app.name === 'Vault')].proxyAddress.toLowerCase()
      const [name, symbol, balance ] = await Promise.all([
        contract.methods.name().call(),
        contract.methods.symbol().call(),
        contract.methods.balanceOf(vault).call(),
      ])
      const metadata = {name, symbol, balance}

      //Register token
      wrapper.tokens.register(address, metadata)
      //Subscribe to token transfer events and update token balance on change
      fromEvent(
        contract.events.Transfer(),
        'data'
      ).pipe(
        filter(event => (event.returnValues.to.toLowerCase() === vault || event.returnValues.from.toLowerCase() === vault))
      ).subscribe(async (event) => {
        const { balance } = await wrapper.tokens.resolve(address)
        if(event.returnValues.to.toLowerCase() === vault){
          wrapper.tokens.modify(address, (new BigNumber(balance)).plus(event.returnValues.value).toString())
        }
        if(event.returnValues.from.toLowerCase() === vault){
          wrapper.tokens.modify(address, (new BigNumber(balance)).minus(event.returnValues.value).toString())
        }
      })

      return Promise.resolve({ address, metadata })
    } catch(e) {
      return Promise.reject(
        new Error(e)
      )
    }

  }

  return Promise.reject(
    new Error('Invalid token registry operation')
  )
}
