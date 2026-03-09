import { useEffect, useRef, useState } from 'react'
import { Alert, Linking, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera'

interface BookData {
  isbn: string
  title?: string
  authors?: Array<{ name: string }>
  publishers?: string[]
  isbn_13?: string
  isbn_10?: string
  publish_date?: string
  number_of_pages?: number
  edition?: string
  subjects?: string[]
  amazonPrice?: number
  amazonLink?: string
  scannedAt: Date
}

export const BarcodeScanner = (): React.JSX.Element => {
  const device = useCameraDevice('back')
  const [cameraPermission, setCameraPermission] = useState<boolean>()
  const [books, setBooks] = useState<BookData[]>([])
  const [manualISBN, setManualISBN] = useState<string>('')
  const scannedISBNs = useRef<Set<string>>(new Set())
  const lastFetchTime = useRef<number>(0)
  const FETCH_COOLDOWN_MS = 1000 // 1 second between fetches for bulk scanning

  const checkCameraPermission = async () => {
    const status = await Camera.getCameraPermissionStatus()
    console.log('status', status)

    if (status === 'granted') {
      setCameraPermission(true)
    } else if (status === 'not-determined' || status === 'denied') {
      console.log('status2', status)
      const permission = await Camera.requestCameraPermission()
      setCameraPermission(permission === 'granted')
    } else {
      setCameraPermission(false)
    }
  }

  const fetchISBNData = async (isbn: string) => {
    const now = Date.now()

    // Throttle: don't fetch within cooldown period
    if (now - lastFetchTime.current < FETCH_COOLDOWN_MS) {
      console.log('Throttling fetch for ISBN:', isbn)
      return
    }

    // Don't fetch if already scanned
    if (scannedISBNs.current.has(isbn)) {
      console.log('ISBN already scanned:', isbn)
      return
    }

    // Update tracking
    lastFetchTime.current = now
    scannedISBNs.current.add(isbn)

    try {
      const response = await fetch(`https://openlibrary.org/isbn/${isbn}.json`)
      if (response.ok) {
        const data = await response.json()

        // Resolve author names when only keys are provided
        let resolvedAuthors: Array<{ name: string }> | undefined = undefined
        if (data.authors && Array.isArray(data.authors) && data.authors.length > 0) {
          resolvedAuthors = []
          for (const author of data.authors) {
            if (author.name) {
              resolvedAuthors.push({ name: author.name })
            } else if (author.key) {
              try {
                const authResp = await fetch(`https://openlibrary.org${author.key}.json`)
                if (authResp.ok) {
                  const authData = await authResp.json()
                  if (authData.name) {
                    resolvedAuthors.push({ name: authData.name })
                  }
                }
              } catch (e) {
                console.log('Error fetching author info:', e)
              }
            }
          }
          if (resolvedAuthors.length === 0) resolvedAuthors = undefined
        }

        // Try to fetch additional data from works endpoint if available
        let subjects: string[] = []
        if (data.works && data.works.length > 0) {
          try {
            const worksResponse = await fetch(`https://openlibrary.org${data.works[0].key}.json`)
            if (worksResponse.ok) {
              const worksData = await worksResponse.json()
              subjects = worksData.subjects || []
            }
          } catch (worksError) {
            console.log('Could not fetch works data:', worksError)
          }
        }

        const bookData: BookData = {
          isbn,
          ...data,
          authors: resolvedAuthors ?? data.authors,
          subjects,
          ...(await fetchAmazonPrice(isbn)),
          scannedAt: new Date(),
        }
        setBooks((prevBooks) => [...prevBooks, bookData])
        console.log('Book added:', bookData)
      } else {
        console.error('Failed to fetch ISBN data:', response.status)
        // Remove from scanned set if fetch failed
        scannedISBNs.current.delete(isbn)
      }
    } catch (error) {
      console.error('Error fetching ISBN data:', error)
      // Remove from scanned set if fetch failed
      scannedISBNs.current.delete(isbn)
    }
  }

  const fetchAmazonPrice = async (isbn: string): Promise<{ price?: number; link?: string }> => {
    try {
      // Try Open Library first for ASIN
      const response = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`
      )
      if (response.ok) {
        const data = await response.json()
        const key = `ISBN:${isbn}`
        if (data[key] && data[key].identifiers && data[key].identifiers.amazon) {
          const asin = data[key].identifiers.amazon[0]
          const amazonLink = `https://www.amazon.com/dp/${asin}`
          console.log('Amazon ASIN found:', asin)

          // Try to fetch price using CheapShark or similar free API
          try {
            const priceResponse = await fetch(
              `https://api.rainforestapi.com/api/v1/products?asin=${asin}&api_key=demo`
            )
            if (priceResponse.ok) {
              const priceData = await priceResponse.json()
              if (priceData.product && priceData.product.buybox_winner) {
                const price = priceData.product.buybox_winner.price
                if (price) {
                  return {
                    price: parseFloat(String(price).replace(/[^0-9.]/g, '')),
                    link: amazonLink,
                  }
                }
              }
            }
          } catch (e) {
            console.log('Could not fetch actual price:', e)
          }

          // Return link even if price fetch failed
          return { link: amazonLink }
        }
      }
      return {}
    } catch (error) {
      console.log('Could not fetch Amazon data:', error)
      return {}
    }
  }

  const resetBookData = () => {
    setBooks([])
    scannedISBNs.current.clear()
    lastFetchTime.current = 0
  }

  const removeBook = (isbn: string) => {
    setBooks((prevBooks) => prevBooks.filter((book) => book.isbn !== isbn))
    scannedISBNs.current.delete(isbn)
  }

  const addManualISBN = () => {
    const trimmedISBN = manualISBN.trim()
    if (!trimmedISBN) {
      Alert.alert('Invalid ISBN', 'Please enter an ISBN number.')
      return
    }

    // Clean the ISBN (remove hyphens, spaces, etc.)
    const cleanISBN = trimmedISBN.replace(/[^0-9X]/gi, '').toUpperCase()

    // Validate ISBN format
    if (cleanISBN.length === 13) {
      // ISBN-13 should start with 978 or 979
      if (!cleanISBN.startsWith('978') && !cleanISBN.startsWith('979')) {
        Alert.alert('Invalid ISBN-13', 'ISBN-13 should start with 978 or 979.')
        return
      }
    } else if (cleanISBN.length === 10) {
      // ISBN-10 validation (basic check)
      if (!/^[0-9]{9}[0-9X]$/.test(cleanISBN)) {
        Alert.alert('Invalid ISBN-10', 'ISBN-10 should be 9 digits followed by a digit or X.')
        return
      }
    } else {
      Alert.alert('Invalid ISBN', 'ISBN should be 10 or 13 digits long.')
      return
    }

    // Check if it's already scanned
    if (scannedISBNs.current.has(cleanISBN)) {
      Alert.alert('Already Scanned', 'This ISBN has already been added to your library.')
      return
    }

    // Clear the input and fetch the book data
    setManualISBN('')
    fetchISBNData(cleanISBN)
  }

  const exportBooksData = () => {
    if (books.length === 0) {
      Alert.alert('No Data', 'No books have been scanned yet.')
      return
    }

    // Convert books to CSV
    const csvData = booksToCSV(books)
    const subject = `BookHub Library Data - ${books.length} Books`
    const body = `BookHub Library Export\n\nTotal Books: ${
      books.length
    }\nExport Date: ${new Date().toLocaleString()}\n\nBook Data (CSV):\n\n${csvData}`

    // Create mailto URL
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      body
    )}`

    Linking.canOpenURL(mailtoUrl)
      .then((supported) => {
        if (supported) {
          Linking.openURL(mailtoUrl)
          Alert.alert(
            'Email Opened',
            'Your default email app has been opened with the library data in CSV format.',
            [{ text: 'OK' }]
          )
        } else {
          // Fallback: copy to clipboard or show alert
          Alert.alert(
            'Email Not Available',
            'Unable to open email app. Data has been logged to console.',
            [{ text: 'OK' }]
          )
          console.log('Exported books data (CSV):', csvData)
        }
      })
      .catch((err) => {
        console.error('Error opening email:', err)
        Alert.alert('Error', 'Failed to open email app.')
      })
  }

  const booksToCSV = (books: BookData[]): string => {
    if (books.length === 0) return ''

    // Define CSV headers
    const headers = [
      'ISBN',
      'Title',
      'Authors',
      'Publishers',
      'ISBN-13',
      'ISBN-10',
      'Publish Date',
      'Number of Pages',
      'Edition',
      'Subjects',
      'Amazon Price',
      'Amazon Link',
      'Scanned At',
    ]

    // Helper function to escape CSV fields
    const escapeCSVField = (field: any): string => {
      if (field === null || field === undefined) return ''
      const str = String(field)
      // If field contains comma, quote, or newline, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"'
      }
      return str
    }

    // Create CSV rows
    const csvRows = [
      headers.join(','), // Header row
      ...books.map((book) =>
        [
          escapeCSVField(book.isbn),
          escapeCSVField(book.title),
          escapeCSVField(book.authors?.map((a) => a.name).join('; ')),
          escapeCSVField(book.publishers?.join('; ')),
          escapeCSVField(book.isbn_13),
          escapeCSVField(book.isbn_10),
          escapeCSVField(book.publish_date),
          escapeCSVField(book.number_of_pages),
          escapeCSVField(book.edition),
          escapeCSVField(book.subjects?.join('; ')),
          escapeCSVField(book.amazonPrice ? `$${book.amazonPrice.toFixed(2)}` : ''),
          escapeCSVField(book.amazonLink),
          escapeCSVField(book.scannedAt?.toLocaleString()),
        ].join(',')
      ),
    ]

    return csvRows.join('\n')
  }

  const codeScanner = useCodeScanner({
    codeTypes: [
      'code-128',
      'code-39',
      'code-93',
      'codabar',
      'ean-13',
      'ean-8',
      'itf',
      'itf-14',
      'upc-e',
      'upc-a',
      'pdf-417',
      'aztec',
      'data-matrix',
    ],
    onCodeScanned: (codes) => {
      codes.forEach((code) => {
        console.log('code: ', code)
        if (
          code.value &&
          code.type === 'ean-13' &&
          (code.value.startsWith('978') || code.value.startsWith('979'))
        ) {
          fetchISBNData(code.value)
        }
      })
    },
  })

  useEffect(() => {
    checkCameraPermission()
  }, [])

  if (cameraPermission === null) {
    return <Text>Checking camera permission...</Text>
  } else if (!cameraPermission) {
    return <Text>Camera permission not granted</Text>
  }

  if (device == null) return <Text>No Device</Text>

  return (
    <View style={{ flex: 1 }}>
      {/* Books Counter */}
      <View style={{ padding: 10, backgroundColor: '#f0f0f0' }}>
        <Text style={{ fontWeight: 'bold' }}>Books Scanned: {books.length}</Text>
      </View>

      <Camera
        device={device}
        isActive={true}
        style={{ flex: 1, height: 300 }}
        codeScanner={codeScanner}
      />

      {/* Manual ISBN Input */}
      <View
        style={{
          padding: 10,
          backgroundColor: '#e8f4fd',
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <TextInput
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#007AFF',
            borderRadius: 5,
            padding: 8,
            marginRight: 10,
            backgroundColor: 'white',
          }}
          placeholder="Enter ISBN manually"
          value={manualISBN}
          onChangeText={setManualISBN}
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          onPress={addManualISBN}
          style={{
            backgroundColor: '#007AFF',
            padding: 10,
            borderRadius: 5,
            minWidth: 80,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Books List */}
      <View style={{ flex: 1 }}>
        {books.length > 0 && (
          <ScrollView style={{ flex: 1, padding: 10 }}>
            {books.map((book, index) => (
              <View
                key={book.isbn}
                style={{
                  backgroundColor: 'white',
                  padding: 15,
                  marginBottom: 10,
                  borderRadius: 8,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                  elevation: 3,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 5 }}>
                      {book.title || 'Unknown Title'}
                    </Text>
                    {book.authors && book.authors.length > 0 && (
                      <Text style={{ color: '#666', marginBottom: 2 }}>
                        Authors: {book.authors.map((a) => a.name).join(', ')}
                      </Text>
                    )}
                    <Text style={{ color: '#666', marginBottom: 2 }}>ISBN: {book.isbn}</Text>
                    {book.publishers && book.publishers.length > 0 && (
                      <Text style={{ color: '#666', marginBottom: 2 }}>
                        Publisher: {book.publishers.join(', ')}
                      </Text>
                    )}
                    {book.publish_date && (
                      <Text style={{ color: '#666', marginBottom: 2 }}>
                        Published: {book.publish_date}
                      </Text>
                    )}
                    {book.number_of_pages && (
                      <Text style={{ color: '#666', marginBottom: 2 }}>
                        Pages: {book.number_of_pages}
                      </Text>
                    )}
                    {book.edition && (
                      <Text style={{ color: '#666', marginBottom: 2 }}>
                        Edition: {book.edition}
                      </Text>
                    )}
                    {book.subjects && book.subjects.length > 0 && (
                      <Text style={{ color: '#666', marginBottom: 2 }}>
                        Subjects: {book.subjects.slice(0, 3).join(', ')}
                        {book.subjects.length > 3 && ` (+${book.subjects.length - 3} more)`}
                      </Text>
                    )}
                    {book.amazonPrice && (
                      <View style={{ marginBottom: 8 }}>
                        <Text
                          style={{
                            color: '#34C759',
                            fontSize: 18,
                            fontWeight: 'bold',
                            marginBottom: 4,
                          }}
                        >
                          ${book.amazonPrice.toFixed(2)}
                        </Text>
                        {book.amazonLink && (
                          <TouchableOpacity onPress={() => Linking.openURL(book.amazonLink!)}>
                            <Text
                              style={{
                                color: '#007AFF',
                                textDecorationLine: 'underline',
                                fontSize: 14,
                              }}
                            >
                              View on Amazon
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                    <Text style={{ color: '#999', fontSize: 12 }}>
                      Scanned: {book.scannedAt.toLocaleString()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeBook(book.isbn)}
                    style={{
                      backgroundColor: '#FF3B30',
                      padding: 8,
                      borderRadius: 4,
                      marginLeft: 10,
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 12 }}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Action Buttons */}
      <View
        style={{
          flexDirection: 'row',
          padding: 10,
          gap: 10,
        }}
      >
        <TouchableOpacity
          onPress={resetBookData}
          style={{
            flex: 1,
            backgroundColor: '#FF3B30',
            padding: 12,
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Clear All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={exportBooksData}
          style={{
            flex: 1,
            backgroundColor: '#34C759',
            padding: 12,
            borderRadius: 8,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Email CSV</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
