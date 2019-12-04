//import Cache from '../cache'
import { concat, fromEvent, of, Subject } from 'rxjs'
import { map, filter } from 'rxjs/operators'
import BigNumber from 'bignumber.js'
import tokenDecimalsAbi from '../../abi/tokens/token-decimals.json'
import tokenNameAbi from '../../abi/tokens/token-name.json'
import tokenSymbolAbi from '../../abi/tokens/token-symbol.json'
import tokenBalanceAbi from '../../abi/tokens/token-balanceof.json'
import tokenEventsAbi from '../../abi/tokens/token-events.json'
import vaultAbi from '../../abi/vault/vault-events.json'

const tokenAbi = [].concat(tokenDecimalsAbi, tokenNameAbi, tokenSymbolAbi, tokenBalanceAbi, tokenEventsAbi)
const ETHER_TOKEN_FAKE_ADDRESS = '0x0000000000000000000000000000000000000000'
/**
 * Token registry
 *
 * @class TokenRegistry
 */
export default class TokenRegistry {
  /**
   * Create a new token registry attached to a locally-stored cache.
   */
  constructor () {
    //this.tokenCache = new Cache('tokenRegistry')
    this.tokenRegistry = new Object()
    this.tokenObservable = new Subject()
  }

  async init (web3, kernelProxy) {
    //await this.tokenCache.init
    this.vault = (await kernelProxy.call('getRecoveryVault')).toLowerCase()
    console.log('Vault: ', this.vault)
    const vaultContract = new web3.eth.Contract(
      vaultAbi,
      this.vault
    )
    console.log('Vault Contract: ', vaultContract)
    //Add ETH and watch the Vault's events to update the balance
    const balance = await web3.eth.getBalance(this.vault)
    console.log('Eth Balance: ', balance)
    const metadata = {name: 'Ethereum', symbol: 'ETH', decimals: '18', balance}
    console.log('Eth Metadata: ', metadata)
    //Register ETH
    this.tokenRegistry[ETHER_TOKEN_FAKE_ADDRESS] = metadata
    console.log('Token Registry: ', this.tokenRegistry)
    //Emit on observable
    this.tokenObservable.next({ address: ETHER_TOKEN_FAKE_ADDRESS, metadata })
    //Watch VaultTransfer for ETH
    fromEvent(
      vaultContract.events.VaultTransfer(),
      'data'
    ).pipe(
      filter(event => event.returnValues.token === ETHER_TOKEN_FAKE_ADDRESS)
    ).subscribe(async (event) => {
      console.log('Token Transfer Event: ', event)
      const { balance } = this.resolve(ETHER_TOKEN_FAKE_ADDRESS)
      this.modify(ETHER_TOKEN_FAKE_ADDRESS, (new BigNumber(balance)).minus(event.returnValues.amount).toString())
    })
    //Watch VaultDeposit for ETH
    fromEvent(
      vaultContract.events.VaultDeposit(),
      'data'
    ).pipe(
      filter(event => event.returnValues.token === ETHER_TOKEN_FAKE_ADDRESS)
    ).subscribe(async (event) => {
      console.log('Token Transfer Event: ', event)
      const { balance } = this.resolve(ETHER_TOKEN_FAKE_ADDRESS)
      this.modify(ETHER_TOKEN_FAKE_ADDRESS, (new BigNumber(balance)).plus(event.returnValues.amount).toString())
    })
  }

  /**
   * Resolve the metadata for a token
   *
   * @param  {string} address Address to resolve
   * @return {Promise} Resolved metadata, null when not found, rejected on error
   */
  resolve (address) {
    return this.tokenRegistry[address.toLowerCase()]
  }

  /**
   * Register a token
   *
   * @param  {Object} web3     A web3 object
   * @param  {string} address  Address to resolve
   * @return {Promise} Resolved with saved address and metadata or rejected on error
   */
  async register (web3, address) {
    console.log('Resolve Address: ', this.resolve(address))
    if(this.resolve(address)){
      return Promise.resolve({ address, metadata: this.resolve(address) })
    } else {
      address = address.toLowerCase()
      const contract = new web3.eth.Contract(
        tokenAbi,
        address
      )
      console.log('Contract: ', contract)

      //Get initial values
      const [name, symbol, decimals, balance ] = await Promise.all([
        contract.methods.name().call(),
        contract.methods.symbol().call(),
        contract.methods.decimals().call(),
        contract.methods.balanceOf(this.vault).call(),
      ])
      const metadata = {name, symbol, decimals, balance}
      console.log('Metadata: ', metadata)

      // First save it in the cache
      //await this.tokenCache.set(address, metadata)
      this.tokenRegistry[address] = metadata
      console.log('Token Registry: ', this.tokenRegistry)
      this.tokenObservable.next({ address, metadata })
      console.log('Token Registered')

      //Subscribe to token transfer events and update token balance on change
      fromEvent(
        contract.events.Transfer(),
        'data'
      ).pipe(
        filter(event => (event.returnValues.to.toLowerCase() === this.vault || event.returnValues.from.toLowerCase() === this.vault))
      ).subscribe(async (event) => {
        console.log('Token Transfer Event: ', event)
        const { balance } = this.resolve(address)
        if(event.returnValues.to.toLowerCase() === this.vault){
          this.modify(address, (new BigNumber(balance)).plus(event.returnValues.value).toString())
        }
        if(event.returnValues.from.toLowerCase() === this.vault){
          this.modify(address, (new BigNumber(balance)).minus(event.returnValues.value).toString())
        }
      })

      return Promise.resolve({ address, metadata })
    }
  }

  /**
   * Modify a token balance
   *
   * @param  {string} address  Address to resolve
   * @param  {Object} balance  New balance
   * @return {Promise} Resolved with saved address and balance or rejected on error
   */
   modify (address, balance = '') {
     if (!balance) {
       throw new Error('balance is required when registering token')
     }

     address = address.toLowerCase()
     const metadata = this.resolve(address)
     metadata.balance = balance
     this.tokenRegistry[address] = metadata
     this.tokenObservable.next({ address, metadata })
     return Promise.resolve({ address, metadata })
   }

  /**
   * Observe the metadata of tokens in cache over time
   *
   * @return {Observable}
   */
  observe () {
    //Get initial token values
    const allTokens = of(this.getAll())
    //Pipe and transform observable
    const changedToken = this.tokenObservable.pipe(
      map(({address, metadata}) => {
        const change = new Object()
        change[address] = metadata
        return change
      })
    )
    //Concat initial token values with new observations
    return concat(allTokens, changedToken)

    /*
    const allTokens$ = this.getAll()
    const result$ = from(allTokens$)
    const changedToken$ = this.tokenCache.changes.pipe(
      map(({key, value}) => {
        const change = new Object()
        change[key] = value
        return change
      })
    ).subscribe(
      change => result$.next(change)
    )
    return result$
    */
    /*
    const source = new BehaviorSubject({})
    this.getAll().then(allToken => {
      console.log('All Tokens: ', allTokens)
      source.next(allTokens)
    })
    /*
    const allTokens = {
      '0x48e9d06106f9b65963472965245f4c676fbd72d6': {name: "Dai Stablecoin", symbol: "DAI", balance: "133000000000000000000"},
      '0xa2be6439d8def6dd6523aefd02a1356772d15569': {name: "Dai Stablecoin", symbol: "DAI", balance: "0"}
    }*/
    /*
    this.tokenCache.changes.subscribe(
      ({key, value}) => {
        console.log('New Change: ' + key + ' ', value)
        allTokens[key] = value
        source.next(allTokens)
      }
    )
    return source
    */
  }

  /**
   * Get all tokens
   *
   * @return {Promise} Resolved with an object of all identities when completed
   */
  getAll () {
    return this.tokenRegistry
  }

  /**
   * Remove a single token from the local cache
   *
   * @return {Promise} Resolved when completed
   */
  remove (address) {
    delete this.tokenRegistry[address.toLowerCase()]
  }
}
