/*
 * Reference-only numeric oracle for the Baye battle formulas.
 *
 * The constants and operation order are derived from the MIT-licensed
 * Baye/baye_c/src/FgtCount.c at the commit pinned by
 * references/upstream-lock.json. This program is not linked into the game;
 * it exists so a real C compiler, rather than the TypeScript implementation,
 * fixes the integer casts and truncation semantics used by test fixtures.
 *
 * Upstream copyright (c) 2015 loongw. See NOTICE.md for the MIT license.
 */

#include <stdint.h>
#include <stdio.h>

typedef int8_t I8;
typedef uint8_t U8;
typedef uint16_t U16;
typedef uint32_t U32;

static const float subdue_modulus[6][6] = {
    {1.0f, 1.2f, 0.8f, 1.0f, 0.7f, 1.3f},
    {0.8f, 1.0f, 1.2f, 1.0f, 0.6f, 1.2f},
    {1.2f, 0.8f, 1.0f, 1.0f, 1.1f, 1.2f},
    {1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f},
    {1.1f, 1.3f, 0.9f, 1.0f, 1.0f, 1.5f},
    {0.6f, 0.6f, 0.6f, 0.6f, 0.6f, 0.6f},
};

static const float attack_modulus[6] = {1.0f, 0.8f, 0.9f, 0.8f, 1.3f, 0.4f};
static const float defence_modulus[6] = {0.7f, 1.2f, 1.0f, 1.1f, 1.2f, 0.6f};
static const float terrain_defence_modulus[8] = {1.0f, 1.0f, 1.3f, 1.15f, 1.1f, 1.5f, 1.2f, 0.8f};

static U16 calc_at(I8 terrain_shift, U16 value) {
    if (0 <= terrain_shift && terrain_shift <= 3) {
        return (U16)(value >> terrain_shift);
    }
    if (terrain_shift > 99) terrain_shift = 99;
    if (terrain_shift < -99) terrain_shift = -99;
    return (U16)(value - (value * (U32)terrain_shift / 100));
}

static U16 build_attack(U8 force, U8 level, U8 arms_type, I8 terrain_shift) {
    U16 value = (U16)(force * (level + 10) * attack_modulus[arms_type]);
    return calc_at(terrain_shift, value);
}

static U16 build_defence(U8 iq, U8 level, U8 arms_type, U8 terrain, I8 terrain_shift) {
    U16 value = (U16)(iq * (level + 10) * defence_modulus[arms_type]);
    value = calc_at(terrain_shift, value);
    value *= terrain_defence_modulus[terrain];
    return value;
}

static U16 count_attack_hurt(U16 attack, U16 defence, U16 troops, U8 attacker_type, U8 defender_type) {
    U16 hurt = (float)attack / defence * (troops >> 3);
    hurt *= subdue_modulus[attacker_type][defender_type];
    return (U16)(hurt + 10);
}

static U8 resolve_arms_type(U8 base_type, U8 first_tool_arm, U8 second_tool_arm) {
    const U8 tool_arms[2] = {first_tool_arm, second_tool_arm};
    U8 arms_type = base_type;
    for (U8 index = 0; index < 2; index++) {
        switch (tool_arms[index]) {
            case 0: break;
            case 1: arms_type = 3; break;
            case 2: arms_type = 5; break;
            case 3: arms_type = 4; break;
            default: arms_type = (U8)(tool_arms[index] - 4); break;
        }
    }
    return arms_type;
}

static U8 strategic_result(U16 attacker_troops, U16 defender_troops,
                           U16 attacker_food, U16 defender_food, U8 random_value) {
    if (attacker_troops > defender_troops) {
        if ((attacker_troops >> 1) > defender_troops) return (U8)((random_value < 30) + 1);
        if (attacker_food > defender_food) return (U8)((random_value < 40) + 1);
        return (U8)((random_value < 60) + 1);
    }
    if (attacker_troops < (defender_troops >> 1)) return (U8)((random_value > 2) + 1);
    if (attacker_food > defender_food) return (U8)((random_value > 30) + 1);
    return (U8)((random_value > 10) + 1);
}

static void print_attack_attributes(void) {
    int first = 1;
    printf("\"attackAttributes\":[");
    for (U8 arms_type = 0; arms_type < 6; arms_type++) {
        for (U8 terrain = 0; terrain < 8; terrain++) {
            if (!first) printf(",");
            first = 0;
            printf("{\"force\":87,\"intelligence\":73,\"level\":12,"
                   "\"armsType\":%u,\"terrain\":%u,\"terrainShift\":0,"
                   "\"attack\":%u,\"defence\":%u}",
                   arms_type, terrain,
                   build_attack(87, 12, arms_type, 0),
                   build_defence(73, 12, arms_type, terrain, 0));
        }
    }
    printf("]");
}

static void print_damage_matrix(void) {
    printf("\"damageMatrix\":{") ;
    printf("\"input\":{\"attack\":1234,\"defence\":987,\"troops\":4096},\"values\":[");
    for (U8 attacker_type = 0; attacker_type < 6; attacker_type++) {
        if (attacker_type) printf(",");
        printf("[");
        for (U8 defender_type = 0; defender_type < 6; defender_type++) {
            if (defender_type) printf(",");
            printf("%u", count_attack_hurt(1234, 987, 4096, attacker_type, defender_type));
        }
        printf("]");
    }
    printf("]}");
}

static void print_shift_cases(void) {
    static const I8 shifts[] = {-25, 0, 1, 2, 3, 4, 25, 100};
    printf("\"terrainShiftCases\":[");
    for (U8 index = 0; index < sizeof(shifts) / sizeof(shifts[0]); index++) {
        if (index) printf(",");
        printf("{\"input\":2000,\"shift\":%d,\"value\":%u}", shifts[index], calc_at(shifts[index], 2000));
    }
    printf("]");
}

static void print_arms_type_cases(void) {
    static const U8 cases[][3] = {
        {0, 0, 0}, {0, 1, 0}, {1, 2, 0}, {2, 3, 0},
        {3, 4, 0}, {0, 5, 0}, {0, 6, 0}, {0, 1, 3},
    };
    printf("\"armsTypeCases\":[");
    for (U8 index = 0; index < sizeof(cases) / sizeof(cases[0]); index++) {
        if (index) printf(",");
        printf("{\"baseArmsType\":%u,\"toolArmCodes\":[%u,%u],\"value\":%u}",
               cases[index][0], cases[index][1], cases[index][2],
               resolve_arms_type(cases[index][0], cases[index][1], cases[index][2]));
    }
    printf("]");
}

static void print_strategic_cases(void) {
    static const U16 cases[][5] = {
        {2000, 900, 100, 100, 29}, {2000, 900, 100, 100, 30},
        {1500, 1000, 500, 400, 39}, {1500, 1000, 500, 400, 40},
        {1500, 1000, 400, 500, 59}, {1500, 1000, 400, 500, 60},
        {1000, 3000, 100, 100, 2}, {1000, 3000, 100, 100, 3},
        {1000, 1200, 500, 400, 30}, {1000, 1200, 500, 400, 31},
        {1000, 1200, 400, 500, 10}, {1000, 1200, 400, 500, 11},
    };
    printf("\"strategicCases\":[");
    for (U8 index = 0; index < sizeof(cases) / sizeof(cases[0]); index++) {
        if (index) printf(",");
        printf("{\"attackerTroops\":%u,\"defenderTroops\":%u,"
               "\"attackerFood\":%u,\"defenderFood\":%u,\"randomValue\":%u,\"result\":%u}",
               cases[index][0], cases[index][1], cases[index][2], cases[index][3], cases[index][4],
               strategic_result(cases[index][0], cases[index][1], cases[index][2], cases[index][3], (U8)cases[index][4]));
    }
    printf("]");
}

int main(void) {
    printf("{");
    print_attack_attributes();
    printf(",");
    print_damage_matrix();
    printf(",");
    print_shift_cases();
    printf(",");
    print_arms_type_cases();
    printf(",");
    print_strategic_cases();
    printf("}\n");
    return 0;
}
