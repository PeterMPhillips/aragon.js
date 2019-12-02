import Cache from '../cache'
import { from, BehaviorSubject } from 'rxjs'
import { map, first, pluck } from 'rxjs/operators'

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
    this.tokenCache = new Cache('tokenRegistry')
  }

  async init () {
    await this.tokenCache.init()
  }

  /**
   * Resolve the metadata for a token
   *
   * @param  {string} address Address to resolve
   * @return {Promise} Resolved metadata, null when not found, rejected on error
   */
  resolve (address) {
    address = address.toLowerCase()
    return this.tokenCache.get(address)
  }

  /**
   * Register a token
   *
   * @param  {string} address  Address to resolve
   * @param  {Object} metadata Metadata to register
   * @return {Promise} Resolved with saved address and metadata or rejected on error
   */
  async register (address, { name = '', symbol = '', balance = ''}) {
    if (!name) {
      throw new Error('name is required when registering token')
    }
    if (!symbol) {
      throw new Error('symbol is required when registering token')
    }
    if (!balance) {
      throw new Error('balance is required when registering token')
    }

    address = address.toLowerCase()

    const metadata = { name, symbol, balance }
    // First save it in the cache
    await this.tokenCache.set(address, metadata)

    return Promise.resolve({ address, metadata })
  }

  /**
   * Modify a token balance
   *
   * @param  {string} address  Address to resolve
   * @param  {Object} balance  New balance
   * @return {Promise} Resolved with saved address and balance or rejected on error
   */
   async modify (address, balance = '') {
     if (!balance) {
       throw new Error('balance is required when registering token')
     }

     address = address.toLowerCase()
     const metadata = await this.resolve(address)
     metadata.balance = balance
     await this.tokenCache.set(address, metadata)

     return Promise.resolve({ address, metadata })
   }

  /**
   * Observe the metadata of tokens in cache over time
   *
   * @return {Observable}
   */
  async subscribe () {
    //Get initial token values
    /*
    const allTokens$ = this.getAll()
    const changedToken$ = this.tokenCache.changes.pipe(
      map(({key, value}) => {
        const change = new Object()
        change[key] = value
        return change
      })
    )
    return concat(allTokens$, changedToken$)
    */
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

    const allTokens = await this.getAll()
    const source = new BehaviorSubject(allTokens)
    console.log('All Tokens: ', allTokens)
    this.tokenCache.changes.subscribe(
      ({key, value}) => {
        console.log('New Change: ' + key + ' ', value)
        allTokens[key] = value
        source.next(allTokens)
      }
    )
    return source.getValue()
  }

  /**
   * Get all tokens
   *
   * @return {Promise} Resolved with an object of all identities when completed
   */
  async getAll () {
    return this.tokenCache.getAll()
  }

  /**
   * Remove a single token from the local cache
   *
   * @return {Promise} Resolved when completed
   */
  async remove (address) {
    await this.tokenCache.remove(address.toLowerCase())
  }
}
