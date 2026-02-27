export function sortUniqueByFrequency(arr: Array<any>) {
    // Step 1: Count frequencies
    const frequencyMap = new Map();
    for (const element of arr) {
        frequencyMap.set(element, (frequencyMap.get(element) || 0) + 1);
    }
    
    // Step 2: Extract unique elements
    const uniqueElements = Array.from(frequencyMap.keys());
    
    // Step 3: Sort by frequency (and secondary criteria)
    uniqueElements.sort((a, b) => {
        const freqA = frequencyMap.get(a);
        const freqB = frequencyMap.get(b);
    
        // Primary sort: frequency
        const freqComparison = freqA - freqB;
        if (freqComparison !== 0) return freqComparison;
    
        // Secondary sort: use custom function or default (a - b for numbers)
        return a - b;
    });
    
    return uniqueElements;
}