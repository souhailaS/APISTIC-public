import SwaggerParser from "@apidevtools/swagger-parser";
import axios from "axios";
import fs from "fs/promises";
import { extractSchemas, groupBySchema } from "./utils/schema-utils.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

/**
 * Process OpenAPI input (object, file path, or URL)
 * @param {object|string} input - OpenAPI object, file path, or URL
 * @returns {Promise<object>} - Fully dereferenced and bundled OpenAPI specification
 */
async function parseOpenAPI(input) {
  try {
    let openAPISpec;

    if (typeof input === "object") {
      console.log("Processing OpenAPI object...");
      openAPISpec = input;
    } else if (typeof input === "string") {
      if (input.startsWith("http")) {
        console.log("Fetching OpenAPI spec from URL...");
        openAPISpec = await fetchAndParseFromURL(input);
      } else {
        console.log("Processing OpenAPI spec from file path...");
        openAPISpec = await SwaggerParser.bundle(input);
      }
    } else {
      throw new Error("Invalid input. Provide an OpenAPI object, file path, or URL.");
    }

    // Dereference the specification
    console.log("Dereferencing OpenAPI specification...");
    openAPISpec = await SwaggerParser.dereference(openAPISpec);

    // Validate the specification
    console.log("Validating OpenAPI specification...");
    await SwaggerParser.validate(openAPISpec);

    return openAPISpec;
  } catch (error) {
    console.error("Error processing OpenAPI input:", error);
    throw error;
  }
}

/**
 * Fetch and parse OpenAPI spec from a URL
 * @param {string} url - URL of the OpenAPI spec
 * @returns {Promise<object>} - Parsed and dereferenced OpenAPI object
 */
async function fetchAndParseFromURL(url) {
  const tempFilePath = "./temp-openapi.yaml";

  try {
    const response = await axios.get(url);
    await fs.writeFile(tempFilePath, response.data, "utf-8");
    const parsedSpec = await SwaggerParser.bundle(tempFilePath);
    return parsedSpec;
  } finally {
    await fs.unlink(tempFilePath); // Clean up temp file
  }
}

/**
 * Compute size metrics for OpenAPI specs
 * @param {object} openAPISpec - Parsed and dereferenced OpenAPI spec
 * @returns {object} - Structural and schema metrics
 *
 * Metrics Explained:
 *
 * **Structure Metrics**:
 * 1. **paths**: Total number of paths defined in the OpenAPI spec.
 * 2. **operations**: Total number of operations (HTTP methods) defined across all paths.
 * 3. **webhooks**: Total number of webhooks defined in the spec.
 * 4. **used_methods**: Number of unique HTTP methods used in the spec.
 * 5. **parametered_operations**: Number of operations that define parameters.
 * 6. **distinct_parameters**: Unique parameter names across all operations.
 * 7. **parameters_per_operations**: Average number of parameters per operation.
 *    Formula: (Total parameters) / (Total operations)
 * 8. **used_parameters**: Total number of parameters used across all operations.
 *
 * **Schema Metrics**:
 * 1. **schemas**: Total number of schemas defined in the OpenAPI spec (from grouped schemas).
 * 2. **defined_schemas**: Number of schemas explicitly defined in the `components.schemas` section (from bundled OpenAPI spec).
 * 3. **properties**: Total number of properties across all schemas.
 * 4. **max_properties**: Maximum number of properties in a single schema.
 * 5. **min_properties**: Minimum number of properties in a schema.
 * 6. **distinct_properties**: Unique property names across all schemas.
 */
async function computeSizeMetrics(openAPISpec) {
  console.log("Extracting and grouping schemas...");
  const { schemas } = await extractSchemas(openAPISpec);
  const groupedSchemas = await groupBySchema(schemas);

  const structureSize = calculateStructureSize(openAPISpec);
  const schemaSize = calculateSchemaSize(openAPISpec, groupedSchemas);

  return { structureSize, schemaSize };
}

/**
 * Calculate structural size metrics
 * @param {object} api - OpenAPI spec
 * @returns {object} - Structural metrics
 */
function calculateStructureSize(api) {
  const structureSize = {
    paths: 0,
    operations: 0,
    webhooks: 0,
    used_methods: 0,
    parametered_operations: 0,
    distinct_parameters: [],
    parameters_per_operations: 0,
    used_parameters: 0,
    methods: {}
  };

  if (api.paths) {
    const paths = api.paths;
    structureSize.paths = Object.keys(paths).length;

    let operations = [];
    let parameters = [];
    HTTP_METHODS.forEach((method) => (structureSize.methods[method] = 0));

    for (const path in paths) {
      for (const method in paths[path]) {
        if (HTTP_METHODS.includes(method.toLowerCase())) {
          operations.push({ path, method });
          structureSize.methods[method.toLowerCase()] += 1;

          if (paths[path][method]?.parameters) {
            parameters = parameters.concat(paths[path][method].parameters);
          }
        }
      }
    }

    structureSize.operations = operations.length;
    structureSize.used_methods = new Set(operations.map((op) => op.method)).size;
    structureSize.parametered_operations = parameters.length;
    structureSize.distinct_parameters = [...new Set(parameters.map((p) => p?.name))];
    structureSize.parameters_per_operations = parameters.length / operations.length || 0;
    structureSize.used_parameters = parameters.length;
  }

  if (api.webhooks) {
    structureSize.webhooks = Object.keys(api.webhooks).length;
  }

  return structureSize;
}

/**
 * Calculate schema size metrics
 * @param {object} api - OpenAPI spec (bundled document)
 * @param {Array} groupedSchemas - Grouped schemas
 * @returns {object} - Schema metrics
 */
function calculateSchemaSize(api, groupedSchemas) {
  const schemaSize = {
    used_schemas: 0,
    defined_schemas: 0,
    properties: 0,
    max_properties: 0,
    min_properties: Number.MAX_SAFE_INTEGER,
    distinct_properties: []
  };

  // Count defined schemas from the bundled OpenAPI spec
  if (api.components?.schemas) {
    schemaSize.defined_schemas = Object.keys(api.components.schemas).length;
  }

  // Process grouped schemas for additional metrics
  let allProperties = [];

  groupedSchemas.forEach((group) => {
    const schema = group.schema;
    if (schema.type === "object" && schema.properties) {
      const properties = Object.keys(schema.properties);
      allProperties = allProperties.concat(properties);
      schemaSize.properties += properties.length;

      schemaSize.max_properties = Math.max(schemaSize.max_properties, properties.length);
      schemaSize.min_properties = Math.min(schemaSize.min_properties, properties.length);
    }
  });

  schemaSize.distinct_properties = [...new Set(allProperties)];
  schemaSize.used_schemas = groupedSchemas.length;

  if (schemaSize.min_properties === Number.MAX_SAFE_INTEGER) {
    schemaSize.min_properties = 0;
  }

  return schemaSize;
}

// Example usage
(async () => {
  const input = "https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml"; // Replace with your input
  try {
    const openAPISpec = await parseOpenAPI(input);
    const metrics = await computeSizeMetrics(openAPISpec);
    console.log("Computed Metrics:", metrics);
  } catch (error) {
    console.error("Failed to compute metrics:", error);
  }
})();