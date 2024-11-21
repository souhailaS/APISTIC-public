import OpenAPIParser from '@readme/openapi-parser';
import axios from 'axios';
import fs from 'fs/promises';

/**
 * Function to process an OpenAPI object
 * @param {object} api - The OpenAPI object to process
 * @returns {object} - The processed documentation data
 *
 * Metrics Explained:
 * 1. **endpointsDescCoverage**: Proportion of HTTP methods (endpoints) that have descriptions or summaries.
 *    Formula: (Number of described endpoints) / (Total number of HTTP methods)
 *
 * 2. **descriptionsSizes**: Array of word counts for descriptions and summaries of each endpoint.
 *
 * 3. **averageMeanSentenceCountPerHundredWords**: Average number of sentences per 100 words.
 *    Helps measure the density of sentence structures in the documentation.
 *    Formula: (Number of sentences / Number of words) * 100
 *
 * 4. **averageMeanCharacterCountPerHundredWords**: Average number of characters per 100 words.
 *    Reflects verbosity or compactness of descriptions.
 *    Formula: (Number of characters / Number of words) * 100
 *
 * 5. **colemanLiauIndex**: A readability score indicating the complexity of the documentation.
 *    Based on sentence and character counts.
 *    Formula: 0.0588 * (Average characters per 100 words) - 
 *             0.296 * (Average sentences per 100 words) - 15.8
 *    Lower values indicate easier-to-read documentation.
 *
 * 6. **averageWordPerSentence**: Average number of words per sentence.
 *    Indicates sentence length, which affects readability.
 *    Formula: (Total words in all descriptions) / (Total sentences in all descriptions)
 *
 * 7. **averageCharacterPerWord**: Average number of characters per word.
 *    Indicates word length, with higher values suggesting more complex vocabulary.
 *    Formula: (Total characters in all descriptions) / (Total words in all descriptions)
 *
 * 8. **automatedReadabilityIndex**: Another readability metric based on word and sentence length.
 *    Formula: 4.71 * (Average characters per word) +
 *             0.5 * (Average words per sentence) - 21.43
 *    Lower values indicate simpler documentation.
 */
async function processOpenAPIObject(api) {
    const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
    let describedEndpoints = [];
    let descriptionsSizes = [];
    let meanSentenceCountPerHundredWords = [];
    let meanCharacterCountPerHundredWords = [];
    let characterPerWord = [];
    let wordPerSentence = [];
    let methods = [];

    const paths = api.paths;

    if (paths) {
        for (let path in paths) {
            let pathObj = paths[path];
            for (let method in pathObj) {
                if (httpMethods.includes(method)) {
                    methods.push(method);

                    let desc = "";
                    let descNumber = 0; // Word count
                    if (pathObj[method].description) {
                        desc += "desc:" + pathObj[method].description;
                        descNumber += pathObj[method].description.split(" ").length;
                    }
                    if (pathObj[method].summary) {
                        desc += "sum:" + pathObj[method].summary;
                        descNumber += pathObj[method].summary.split(" ").length;
                    }

                    // Compute metrics
                    let sentences = desc.split(/[.!?]+/);
                    let words = desc.split(" ");
                    let sentenceCount = sentences.length;
                    let wordCount = words.length;
                    let characterCount = desc.length;

                    let meanSentenceCountPerHundredWordsEndpoint = (sentenceCount / wordCount) * 100;
                    let meanCharacterCountPerHundredWordsEndpoint = (characterCount / wordCount) * 100;
                    let wordPerSentenceEndpoint = wordCount / sentenceCount;
                    let characterPerWordEndpoint = characterCount / wordCount;

                    if (desc !== "") {
                        describedEndpoints.push(method + "/ " + desc);
                    }
                    descriptionsSizes.push(descNumber);
                    meanSentenceCountPerHundredWords.push(meanSentenceCountPerHundredWordsEndpoint);
                    meanCharacterCountPerHundredWords.push(meanCharacterCountPerHundredWordsEndpoint);
                    characterPerWord.push(characterPerWordEndpoint);
                    wordPerSentence.push(wordPerSentenceEndpoint);
                }
            }
        }
    }

    let endpointsDescCoverage = describedEndpoints.length / methods.length;

    return {
        endpointsDescCoverage,
        describedEndpoints,
        descriptionsSizes,
        averageMeanSentenceCountPerHundredWords: meanSentenceCountPerHundredWords.reduce((a, b) => a + b, 0) / methods.length,
        averageMeanCharacterCountPerHundredWords: meanCharacterCountPerHundredWords.reduce((a, b) => a + b, 0) / methods.length,
        colemanLiauIndex:
            (0.0588 * (meanCharacterCountPerHundredWords.reduce((a, b) => a + b, 0) / methods.length)) -
            (0.296 * (meanSentenceCountPerHundredWords.reduce((a, b) => a + b, 0) / methods.length)) -
            15.8,
        averageWordPerSentence: wordPerSentence.reduce((a, b) => a + b, 0) / methods.length,
        averageCharacterPerWord: characterPerWord.reduce((a, b) => a + b, 0) / methods.length,
        automatedReadabilityIndex:
            4.71 * (characterPerWord.reduce((a, b) => a + b, 0) / methods.length) +
            0.5 * (wordPerSentence.reduce((a, b) => a + b, 0) / methods.length) -
            21.43,
    };
}

/**
 * Function to process OpenAPI input (object, file path, or URL)
 * @param {object|string} input - Either an OpenAPI object, a file path, or a URL to an OpenAPI file
 * @returns {Promise<object>} - The processed documentation data
 */
async function processOpenAPI(input) {
    try {
        let api;

        if (typeof input === 'object') {
            console.log('Processing OpenAPI object...');
            api = input;
        } else if (typeof input === 'string') {
            if (input.startsWith('http')) {
                console.log('Fetching OpenAPI file from URL...');
                const response = await axios.get(input);
                const tempFilePath = './temp-openapi.yaml';
                await fs.writeFile(tempFilePath, response.data, 'utf-8');
                api = await OpenAPIParser.validate(tempFilePath);
                await fs.unlink(tempFilePath); // Clean up temp file
            } else {
                console.log('Processing OpenAPI file from local path...');
                api = await OpenAPIParser.validate(input);
            }
        } else {
            throw new Error('Invalid input type. Must be an OpenAPI object, file path, or URL.');
        }

        // Process the OpenAPI object
        const processedData = await processOpenAPIObject(api);
        console.log('Processed Documentation Data:', processedData);

        return processedData;
    } catch (error) {
        console.error('Error processing OpenAPI input:', error);
    }
}

// Example usage with the OpenAI OpenAPI file URL
(async () => {
    const url = 'https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml';

    console.log('Processing OpenAPI file from URL...');
    await processOpenAPI(url);
})();