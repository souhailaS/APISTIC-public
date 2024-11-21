import compare from "json-schema-compare";
import axios from "axios";
import converter from 'swagger2openapi';

/**
 * Extracts schemas from an API specification.
 * @param {object} deref_api - The API specification object.
 * @returns {Array|null} Extracted schemas or null if an error occurs.
 */
export const extractSchemas = async (derefApi) => {
  try {
    // Convert to OpenAPI 3 if needed
    if (!derefApi.openapi) {
      // const spec = await convert2V3(derefApi, { warnOnly: true });
      const spec = await convert2V3_2(derefApi);
      derefApi = spec;
    }

    // Process and extract schemas from API paths
    let schemas = Object.entries(derefApi.paths).flatMap(([path, methods]) =>
      Object.entries(methods)
        .filter(([, methodDetails]) => methodDetails?.responses)
        .flatMap(([method, methodDetails]) =>
          Object.entries(methodDetails?.responses).map(([code, response]) => ({
            code,
            path,
            method,
            res: response,
            req: methodDetails?.requestBody,
            parametersMethod: methodDetails.parameters,
            parametersPath: derefApi.paths[path].parameters,
          }))
        )
    );

    return { schemas: schemas, converted: derefApi };
  } catch (err) {
    console.error(err);
    return null;
  }
};

/**
 * Groups API schemas.
 * @param {Array} array - The array of schema objects.
 * @returns {Array} Grouped schemas.
 */
export const groupBySchema = async (array) => {
  let grouped = [];

  // Process response and request separately
  const processType = async (type) => {
    for (const item of array.filter((i) => i[type]?.content?.["application/json"]?.schema)) {
      const currentSchema = item[type].content["application/json"].schema.items || item[type].content["application/json"].schema;

      try {
        const similarSchema = await findSimilarSchema(grouped, currentSchema);

        if (similarSchema) {
          updateGroupedSchema(similarSchema, item, type);
        } else {
          addNewSchema(grouped, item, type);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  await processType("res");
  await processType("req");

  return grouped;
};

const updateGroupedSchema = (group, item, type) => {
  const endpoint = { method: item.method, path: item.path, code: item.code };
  if (!group.endpoints.some(e => e.path === endpoint.path && e.method === endpoint.method && e.code === endpoint.code)) {
    group.endpoints.push(endpoint);
  }
  if (!group.message_type.includes(type)) {
    group.message_type.push(type);
  }
};

const addNewSchema = (grouped, item, type) => {
  const newSchema = {
    schema: item[type].content["application/json"].schema.items || item[type].content["application/json"].schema,
    endpoints: [{ method: item.method, path: item.path, code: item.code }],
    message_type: [type],
  };
  grouped.push(newSchema);
};

/**
 * Compares two schemas to determine if they are similar.
 * @param {Array} sourceArray - Array of source schemas.
 * @param {object} destination - The destination schema to compare with.
 * @returns {object|false} Similar schema object or false if not found.
 */
export const findSimilarSchema = async (sourceArray, destination) => {
  const comparisons = await Promise.all(sourceArray.map(async (source) =>
    compare(source.schema, destination, { ignore: ["description"] }) ? source : false
  ));

  return comparisons.find(result => result !== false);
};

/**
 * 
 * @param {*} api 
 * @returns 
 */
export const convert2V3 = async (api) => {
  console.log("converting to v3");
  //https://converter.swagger.io/api/convert
  try {
    // const response = await axios.post("https://converter.swagger.io/api/convert", api);
    const response = await axios.post("http://localhost:8080/api/convert", api);
    return response.data;
  }
  catch (e) {
    console.error(e);
    return api;
  }
}


/**
 * 
 * @param {*} api 
 * @returns 
 */
export const convert2V3_2 = async (api) => {
  console.log("converting to v3");
  //https://converter.swagger.io/api/convert
  try {
    // console.log(api);
    let options = {};
    const { openapi } = await converter.convertObj(api, options);
    console.log(openapi.openapi);
    return openapi;
  }
  catch (e) {
    // console.error(e.options.openapi);
    return e.options.openapi;
  }
}