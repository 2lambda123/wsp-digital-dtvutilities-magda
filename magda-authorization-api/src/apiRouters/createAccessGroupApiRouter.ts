import express, { Request, Response, NextFunction } from "express";
import Database from "../Database";
import respondWithError from "../respondWithError";
import AuthDecisionQueryClient from "magda-typescript-common/src/opa/AuthDecisionQueryClient";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import {
    getUserId,
    requireUnconditionalAuthDecision
} from "magda-typescript-common/src/authorization-api/authMiddleware";
import { createTableRecord } from "magda-typescript-common/src/SQLUtils";
import ServerError from "magda-typescript-common/src/ServerError";
import {
    CreateAccessGroupRequestBodyType,
    UpdateAccessGroupRequestBodyType
} from "magda-typescript-common/src/authorization-api/model";
import isUuid from "magda-typescript-common/src/util/isUuid";
import { v4 as uuidV4 } from "uuid";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import isArray from "lodash/isArray";
import uniq from "lodash/uniq";

type JsonPatch = {
    op: string;
    path: string;
    value?: any;
};

export interface ApiRouterOptions {
    database: Database;
    authDecisionClient: AuthDecisionQueryClient;
    jwtSecret: string;
    registryClient: AuthorizedRegistryClient;
}

export default function createAccessGroupApiRouter(options: ApiRouterOptions) {
    const database = options.database;
    const authDecisionClient = options.authDecisionClient;
    const registryClient = options.registryClient;

    const router: express.Router = express.Router();

    async function validateAccessGroupCreationData(
        req: Request,
        res: Response
    ) {
        let {
            name,
            description,
            resourceUri,
            keywords,
            operationUris,
            ownerId,
            orgUnitId
        } = req.body as CreateAccessGroupRequestBodyType;

        if (!name) {
            throw new ServerError("`name` field cannot be empty", 400);
        }
        if (!resourceUri) {
            throw new ServerError("`resourceUri` field cannot be empty", 400);
        }
        if (resourceUri !== "object/record") {
            throw new ServerError(
                `Invalid value ${resourceUri} supplied for field \`${resourceUri}\``,
                400
            );
        }

        keywords = uniq(!keywords?.length ? [] : keywords).filter(
            (item) => !!item
        );
        const invalidKeyword = keywords.find(
            (item) => typeof item !== "string"
        );
        if (typeof invalidKeyword !== "undefined") {
            throw new ServerError(
                `One of keyword items is an invalid non-string value: ${invalidKeyword}`,
                400
            );
        }

        description = description ? "" + description : "";

        operationUris = uniq(
            !operationUris?.length ? [] : operationUris
        ).filter((item) => !!item);
        const invalidOperationUri = operationUris.find(
            (item) =>
                typeof item !== "string" || !item.startsWith("object/record/")
        );
        if (typeof invalidOperationUri !== "undefined") {
            throw new ServerError(
                `One of operationUris supplied is invalid: ${invalidOperationUri}`,
                400
            );
        }

        if (ownerId && !isUuid(ownerId)) {
            throw new ServerError(
                `Supplied ownerId is not valid UUID: ${ownerId}`,
                400
            );
        }

        if (orgUnitId && !isUuid(orgUnitId)) {
            throw new ServerError(
                `Supplied orgUnitId is not valid UUID: ${orgUnitId}`,
                400
            );
        }

        if (!ownerId && ownerId !== null && res.locals.userId) {
            // needs to pre-fill ownerId with request user's id
            ownerId = res.locals.userId;
        }

        if (!orgUnitId && orgUnitId !== null && res.locals.userId) {
            // needs to pre-fill orgUnitId with request user's orgUnitId
            const user = await database.getUser(res.locals.userId);
            orgUnitId = user
                .map((item) => (item.orgUnitId ? item.orgUnitId : null))
                .valueOr<string | null>(null);
        }

        ownerId = ownerId ? ownerId : null;
        orgUnitId = orgUnitId ? orgUnitId : null;

        return {
            name,
            description,
            resourceUri,
            keywords,
            operationUris,
            ownerId,
            orgUnitId
        };
    }

    /**
     * @apiGroup Auth Access Groups
     * @api {post} /v0/auth/accessGroups Create a new access group
     * @apiDescription Create a new access group.
     * Returns the newly created access group.
     * Required `object/accessGroup/create` permission to access this API.
     *
     * @apiParam (Request Body) {string} name A name given to the access group
     * @apiParam (Request Body) {string} [description] The free text description for the access group
     * @apiParam (Request Body) {string[]} [keywords] Tags (or keywords) help users discover the access-group
     * @apiParam (Request Body) {string} resourceUri The Resource URI specifies the type of resources that the access group manages.
     * At this moment, only one value `object/record` (registry records) is supported.
     * @apiParam (Request Body) {string} operationUris A list of operations that the access group allows enrolled users to perform on included resources.
     * @apiParam (Request Body) {string} [ownerId] The user ID of the access group owner. If not specified, the request user (if available) will be the owner.
     * If a `null` value is supplied, the owner of the access group will be set to `null`.
     * @apiParam (Request Body) {string} [orgUnitId] The ID of the orgUnit that the access group belongs to. If not specified, the request user's orgUnit (if available) will be used.
     * If a `null` value is supplied, the orgUnit of the access group will be set to `null`.
     *
     * @apiParamExample (Body) {json}:
     *     {
     *       "name": "a test access group",
     *       "description": "a test access group",
     *       "resourceUri": "object/record",
     *       "keywords": ["keyword 1", "keyword2"],
     *       "operationUris": ["object/record/read", "object/record/update"],
     *       "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "orgUnitId": "36ef9450-6579-421c-a178-d3b5b4f1a3df"
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "name": "a test access group",
     *       "description": "a test access group",
     *       "resourceUri": "object/record",
     *       "operationUris": ["object/record/read", "object/record/update"],
     *       "keywords": ["keyword 1", "keyword2"],
     *       "permissionId": "2b117a5f-dadb-4130-bf44-b72ee67d009b",
     *       "roleId": "5b616fa0-a123-4e9c-b197-65b3db8522fa",
     *       "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "orgUnitId": "36ef9450-6579-421c-a178-d3b5b4f1a3df",
     *       "createBy": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "editTime": "2022-03-28T10:18:10.479Z",
     *       "editBy": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "editTime": "2022-03-28T10:18:10.479Z"
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/",
        requireUnconditionalAuthDecision(authDecisionClient, (req, res) => ({
            operationUri: "object/accessGroup/create",
            input: {
                object: {
                    accessGroup: req.body
                }
            }
        })),
        getUserId,
        async (req: Request, res: Response) => {
            try {
                const agData = await validateAccessGroupCreationData(req, res);
                const recordId = uuidV4();
                const userId = res.locals.userId;
                const timestamp = new Date().toISOString();
                const pool = database.getPool();
                const client = await pool.connect();
                const agRecord = {
                    id: recordId,
                    name: agData.name,
                    aspects: {
                        "access-group-details": {
                            name: agData.name,
                            resourceUri: agData.resourceUri,
                            description: agData.description,
                            keywords: agData.keywords,
                            operationUris: agData.operationUris,
                            createTime: timestamp,
                            createBy: userId,
                            editTime: timestamp,
                            editBy: userId,
                            permissionId: "",
                            roleId: ""
                        },
                        "access-control": {
                            ownerId: agData.ownerId,
                            orgUnitId: agData.orgUnitId
                        }
                    }
                };

                try {
                    await client.query("BEGIN");

                    const permissionRecord = await database.createPermission(
                        {
                            name: "auto-created access group permission",
                            description:
                                "auto-created access group permission for access group " +
                                recordId,
                            resourceUri: agData.resourceUri,
                            operationUris: agData.operationUris,
                            userOwnershipConstraint: false,
                            orgUnitOwnershipConstraint: false,
                            preAuthorisedConstraint: true,
                            createBy: userId ? userId : null,
                            ownerId: userId ? userId : null
                        },
                        client
                    );

                    const roleData = {
                        name: "auto-created access group role",
                        description:
                            "auto-created access group role for access group " +
                            recordId
                    } as any;

                    if (userId) {
                        roleData["create_by"] = userId;
                        roleData["owner_id"] = userId;
                        roleData["edit_by"] = userId;
                    }

                    const role = await createTableRecord(
                        client,
                        "roles",
                        roleData,
                        [
                            "name",
                            "description",
                            "create_by",
                            "owner_id",
                            "edit_by"
                        ]
                    );

                    agRecord.aspects["access-group-details"].permissionId =
                        permissionRecord.id;
                    agRecord.aspects["access-group-details"].roleId = role.id;

                    const recordCreationResult = await registryClient.creatRecord(
                        agRecord as any
                    );
                    if (recordCreationResult instanceof Error) {
                        throw recordCreationResult;
                    }
                    await client.query("COMMIT");
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    client.release();
                }
                res.json({
                    ...agRecord.aspects["access-group-details"],
                    id: recordId,
                    ownerId: agData.ownerId,
                    orgUnitId: agData.orgUnitId
                });
            } catch (e) {
                respondWithError("Create Access Group", res, e);
            }
        }
    );

    async function patchAccessGroup(
        id: string,
        recordJsonPatches: JsonPatch[]
    ) {
        const resultOrError = await registryClient.patchRecord(
            id,
            recordJsonPatches
        );
        if (resultOrError instanceof Error) {
            throw resultOrError;
        }
        const recordOrError = await registryClient.getRecord(
            id,
            ["access-group-details"],
            ["access-control"],
            false
        );
        if (recordOrError instanceof Error) {
            throw recordOrError;
        }
        return {
            ...(recordOrError?.aspects?.["access-group-details"]
                ? recordOrError.aspects["access-group-details"]
                : {}),
            ownerId: recordOrError?.aspects?.["access-control"]?.ownerId
                ? recordOrError.aspects["access-control"].ownerId
                : null,
            orgUnitId: recordOrError?.aspects?.["access-control"]?.orgUnitId
                ? recordOrError.aspects["access-control"].orgUnitId
                : null,
            id
        };
    }

    const requireAccessGroupAccess = (
        operationUri: string,
        notFoundHandler?: (
            req: Request,
            res: Response,
            next: NextFunction
        ) => void
    ) =>
        requireUnconditionalAuthDecision(
            authDecisionClient,
            async (req: Request, res: Response, next: NextFunction) => {
                const id = `${req.params.id}`.trim();
                if (!id) {
                    throw new ServerError(
                        "Cannot locate valid ID from url path",
                        400
                    );
                }
                const recordOrError = await registryClient.getRecord(
                    id,
                    ["access-group-details"],
                    ["access-control"],
                    false
                );
                if (recordOrError instanceof Error) {
                    if (
                        recordOrError instanceof ServerError &&
                        recordOrError.statusCode === 404
                    ) {
                        if (typeof notFoundHandler === "function") {
                            notFoundHandler(req, res, next);
                            return null;
                        }
                    }
                    throw recordOrError;
                }
                res.locals.originalAccessGroup = recordOrError;
                return {
                    operationUri,
                    input: {
                        object: {
                            accessGroup: {
                                ...(recordOrError?.aspects?.[
                                    "access-group-details"
                                ]
                                    ? recordOrError.aspects[
                                          "access-group-details"
                                      ]
                                    : {})
                            }
                        }
                    }
                };
            }
        );

    /**
     * @apiGroup Auth Access Groups
     * @api {put} /v0/auth/accessGroups/:id Update an access group
     * @apiDescription Update an access group
     * Supply a JSON object that contains fields to be updated in body.
     * You need have `authObject/operation/update` permission to access this API.
     * Please note: you can't update the `resourceUri` field of an access group.
     * If you have to change the resource type, you should delete the access group and create a new one.
     *
     * @apiParam (URL Path) {string} id id of the access group
     * @apiParam (Request Body) {string} [name] the name given to the access group
     * @apiParam (Request Body) {string} [description] The free text description for the access group
     * @apiParam (Request Body) {string[]} [keywords] Tags (or keywords) help users discover the access-group
     * @apiParam (Request Body) {string} [operationUris] A list of operations that the access group allows enrolled users to perform on included resources.
     * @apiParam (Request Body) {string} [ownerId] The user ID of the access group owner. If not specified, the request user (if available) will be the owner.
     * If a `null` value is supplied, the owner of the access group will be set to `null`.
     * @apiParam (Request Body) {string} [orgUnitId] The ID of the orgUnit that the access group belongs to. If not specified, the request user's orgUnit (if available) will be used.
     * If a `null` value is supplied, the orgUnit of the access group will be set to `null`.
     * @apiParamExample (Body) {json}:
     *     {
     *       "name": "a test access group 2",
     *       "description": "a test access group",
     *       "keywords": ["keyword 1", "keyword2"],
     *       "operationUris": ["object/record/read"],
     *       "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "orgUnitId": null
     *     }
     *
     * @apiSuccessExample {json} 200
     *    {
     *       "id": "e30135df-523f-46d8-99f6-2450fd8d6a37",
     *       "name": "a test access group 2",
     *       "description": "a test access group",
     *       "resourceUri": "object/record",
     *       "operationUris": ["object/record/read"],
     *       "keywords": ["keyword 1", "keyword2"],
     *       "permissionId": "2b117a5f-dadb-4130-bf44-b72ee67d009b",
     *       "roleId": "5b616fa0-a123-4e9c-b197-65b3db8522fa",
     *       "ownerId": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "orgUnitId": null,
     *       "createBy": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "editTime": "2022-03-28T10:18:10.479Z",
     *       "editBy": "3535fdad-1804-4614-a9ce-ce196e880238",
     *       "editTime": "2022-03-28T10:18:10.479Z"
     *    }
     *
     * @apiErrorExample {json} 401/404/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 404, 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.put(
        "/:id",
        requireAccessGroupAccess("object/record/update"),
        getUserId,
        async function (req: Request, res: Response) {
            try {
                const id = `${req.params.id}`.trim();
                const userId = res.locals.userId;
                const permissionId =
                    res?.locals?.originalAccessGroup?.aspects?.[
                        "access-group-details"
                    ]?.permissionId;
                if (!permissionId) {
                    throw new ServerError(
                        "The current access group record has invalid empty permissionId.",
                        500
                    );
                }

                const data = req.body as UpdateAccessGroupRequestBodyType;
                const jsonPatches: {
                    op: string;
                    path: string;
                    value: any;
                }[] = [];
                if (typeof data?.name !== "undefined") {
                    jsonPatches.push({
                        op: "replace",
                        path: "/aspects/access-group-details/name",
                        value: `${data.name}`
                    });
                }
                if (typeof data?.description !== "undefined") {
                    jsonPatches.push({
                        op: "replace",
                        path: "/aspects/access-group-details/description",
                        value: `${data.description}`
                    });
                }
                if (typeof data?.keywords !== "undefined") {
                    if (!isArray(data.keywords)) {
                        throw new ServerError(
                            "`keywords` field should be an array.",
                            400
                        );
                    }
                    const keywords = data.keywords.filter(
                        (item) => typeof item === "string"
                    );
                    if (keywords.length !== data.keywords.length) {
                        throw new ServerError(
                            "All items in `keywords` field should be strings.",
                            400
                        );
                    }
                    jsonPatches.push({
                        op: "replace",
                        path: "/aspects/access-group-details/keywords",
                        value: uniq(keywords)
                    });
                }
                if (typeof data?.ownerId !== "undefined") {
                    if (!isUuid(data.ownerId) && data.ownerId !== null) {
                        throw new ServerError(
                            "`ownerId` field needs to be either an UUID or null.",
                            400
                        );
                    }
                    jsonPatches.push({
                        op: "replace",
                        path: "/aspects/access-control/ownerId",
                        value: data.ownerId
                    });
                }
                if (typeof data?.orgUnitId !== "undefined") {
                    if (!isUuid(data.orgUnitId) && data.orgUnitId !== null) {
                        throw new ServerError(
                            "`ownerId` field needs to be either an UUID or null.",
                            400
                        );
                    }
                    jsonPatches.push({
                        op: "replace",
                        path: "/aspects/access-control/orgUnitId",
                        value: data.orgUnitId
                    });
                }

                if (typeof data?.operationUris === "undefined") {
                    // no need to update permission operations as it's not supplied
                    res.json(await patchAccessGroup(id, jsonPatches));
                    return;
                }

                const pool = database.getPool();
                const client = await pool.connect();

                try {
                    await client.query("BEGIN");

                    await database.updatePermission(
                        permissionId,
                        {
                            operationUris: data.operationUris,
                            ownerId: data?.ownerId ? data.ownerId : null,
                            editBy: userId ? userId : null
                        },
                        client
                    );

                    res.json(await patchAccessGroup(id, jsonPatches));
                    await client.query("COMMIT");
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    client.release();
                }
            } catch (e) {
                respondWithError(
                    `Update Access Group: ${req?.params?.id}`,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {delete} /v0/auth/accessGroups/:id Delete an access group
     * @apiDescription Delete an access group
     * You can only delete an access group when all resources (e.g. datasets) that are associated with the access group are removed from the access group.
     * Once an access group is deleted, the role & permission that are associated with the access group will be also deleted.
     *
     * You need `object/record/delete` permission to the access group record in order to access this API.
     *
     * @apiParam (URL Path) {string} id id of the access group
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the deletion action is actually performed or the access group doesn't exist.
     * @apiSuccessExample {json} 200
     *    {
     *        result: true
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.delete(
        "/:id",
        requireAccessGroupAccess(
            "object/record/delete",
            (req, res, next: Function) => {
                // reach here indicates the access group record doesn't exist
                // we will response 200 with {result: false}
                res.json({ result: false });
                return null; // return null to skip rest of request processing
            }
        ),
        async function (req, res) {
            try {
                const id = `${req.params.id}`.trim();
                // use previously fetched record by `requireAccessGroupAccess`
                const accessGroupRecord = res.locals
                    .originalAccessGroup as Record;
                const permissionId =
                    accessGroupRecord?.aspects?.["access-group-details"]?.[
                        "permissionId"
                    ];
                const roleId =
                    accessGroupRecord?.aspects?.["access-group-details"]?.[
                        "roleId"
                    ];
                if (!isUuid(permissionId)) {
                    throw new ServerError(
                        "The access group permission id is not a valid UUID",
                        500
                    );
                }
                if (!isUuid(roleId)) {
                    throw new ServerError(
                        "The access group role id is not a valid UUID",
                        500
                    );
                }
                const searchRecordResult = await registryClient.getRecords(
                    [],
                    [],
                    undefined,
                    undefined,
                    1,
                    [
                        `access-control.preAuthorisedPermissionIds:<|${encodeURIComponent(
                            permissionId
                        )}`
                    ]
                );
                if (searchRecordResult instanceof Error) {
                    throw searchRecordResult;
                }
                if (searchRecordResult?.records?.length) {
                    throw new ServerError(
                        "You need to remove all records from the access group before you can delete the access group",
                        400
                    );
                }

                const pool = database.getPool();
                const client = await pool.connect();

                try {
                    await client.query("BEGIN");

                    await database.deleteRole(roleId, client);
                    await database.deletePermission(permissionId, client);

                    const deleteResult = await registryClient.deleteRecord(id);
                    if (deleteResult instanceof Error) {
                        throw deleteResult;
                    }
                    await client.query("COMMIT");
                    res.json({
                        result: deleteResult?.deleted === true ? true : false
                    });
                } catch (e) {
                    await client.query("ROLLBACK");
                    throw e;
                } finally {
                    client.release();
                }
            } catch (e) {
                respondWithError(
                    `delete \`access group\` ${req?.params?.id}`,
                    res,
                    e
                );
            }
        }
    );

    /**
     * @apiGroup Auth Access Groups
     * @api {post} /v0/auth/accessGroups/:groupId/datasets/:datasetId Add an Dataset to an Access Group
     * @apiDescription Add an Dataset to an Access Group
     *
     * Access group users will all granted access (specified by the access group permission) to all added datasets.
     *
     * You need `object/record/update` permission to both access group and dataset record in order to access this API.
     *
     * @apiParam (URL Path) {string} groupId id of the access group
     * @apiParam (URL Path) {string} datasetId id of the dataset
     *
     * @apiSuccess [Response Body] {boolean} result Indicates whether the action is actually performed or the dataset had already been added to the access group.
     * @apiSuccessExample {json} 200
     *    {
     *        result: true
     *    }
     *
     * @apiErrorExample {json} 401/500
     *    {
     *      "isError": true,
     *      "errorCode": 401, //--- or 500 depends on error type
     *      "errorMessage": "Not authorized"
     *    }
     */
    router.post(
        "/:groupId/datasets/:datasetId",
        requireUnconditionalAuthDecision(
            authDecisionClient,
            async (req, res, next) => {
                const datasetId = req.params?.datasetId;
                if (!datasetId) {
                    throw new ServerError("datasetId cannot be empty", 400);
                }
                const fetchRecordResult = await registryClient.getRecordInFull(
                    datasetId
                );
                if (fetchRecordResult instanceof Error) {
                    throw fetchRecordResult;
                }
                const { aspects, ...recordData } = fetchRecordResult;
                if (aspects?.length) {
                    aspects.forEach(
                        (item: any, idx: string) =>
                            ((recordData as any)[idx] = item)
                    );
                }
                res.locals.originalAccessGroup = fetchRecordResult;
                return {
                    operationUri: "object/record/update",
                    input: {
                        object: {
                            recordData
                        }
                    }
                };
            }
        ),
        requireUnconditionalAuthDecision(
            authDecisionClient,
            async (req, res, next) => {
                const groupId = req.params?.groupId;
                if (!groupId) {
                    throw new ServerError(
                        "access group id cannot be empty",
                        400
                    );
                }
                const fetchRecordResult = await registryClient.getRecordInFull(
                    groupId
                );
                if (fetchRecordResult instanceof Error) {
                    throw fetchRecordResult;
                }
                const { aspects, ...recordData } = fetchRecordResult;
                if (aspects?.length) {
                    aspects.forEach(
                        (item: any, idx: string) =>
                            ((recordData as any)[idx] = item)
                    );
                }
                res.locals.originalDataset = fetchRecordResult;
                return {
                    operationUri: "object/record/update",
                    input: {
                        object: {
                            recordData
                        }
                    }
                };
            }
        ),
        async function (req, res) {
            try {
                const recordIds = [] as string[];
                if (res?.locals?.originalDataset?.id) {
                    recordIds.push(res.locals.originalDataset.id as string);
                }

                const distributionIds =
                    res?.locals?.originalDataset?.aspects?.[
                        "dataset-distributions"
                    ];

                if (distributionIds?.length) {
                    recordIds.splice(0, 0, ...distributionIds);
                }

                const permissionId =
                    res?.locals?.originalAccessGroup?.aspects?.[
                        "access-group-details"
                    ]?.["permissionId"];

                if (!isUuid(permissionId)) {
                    throw new ServerError(
                        `The access group "${req.params?.groupId}" has an invalid permissionId.`,
                        500
                    );
                }

                const result = await registryClient.putRecordsAspect(
                    recordIds,
                    "access-control",
                    {
                        preAuthorisedPermissionIds: [permissionId]
                    },
                    // merge data. will not produce duplicates array items
                    true
                );

                if (result instanceof Error) {
                    throw result;
                }
                res.json({ result: true });
            } catch (e) {
                respondWithError(
                    `Add an Dataset "${req?.params?.datasetId}" to an Access Group ${req?.params?.groupId}`,
                    res,
                    e
                );
            }
        }
    );

    return router;
}